import {
	bytesToHex,
	consensusIdenticalAggregation,
	CronCapability,
	EVMClient,
	encodeCallMsg,
	getNetwork,
	handler,
	hexToBase64,
	type HTTPSendRequester,
	HTTPClient,
	LAST_FINALIZED_BLOCK_NUMBER,
	type Runtime,
	TxStatus,
} from '@chainlink/cre-sdk'
import {
	type Address,
	decodeFunctionResult,
	encodeAbiParameters,
	encodeFunctionData,
	type Hex,
	parseAbi,
	hashTypedData,
	hexToBytes,
	zeroAddress,
} from 'viem'
import { publicKeyToAddress } from 'viem/utils'
import { secp256k1 } from '@noble/curves/secp256k1'
import { z } from 'zod'

const hex = (bytes: number) => z.string().regex(new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`))
const uint = z.string().regex(/^\d+$/)

export const configSchema = z.object({
	schedule: z.string(),
	meterApiUrl: z.string(),
	meterId: hex(32),
	meterSigner: hex(20),
	consumer: hex(20),
	supplierId: uint,
	chainName: z.string(),
	chainId: z.number(),
	chainSelector: uint,
	receiverAddress: hex(20),
	policyHash: hex(32),
	gasLimit: uint,
})
type Config = z.infer<typeof configSchema>

// Meter API response: the whole envelope is the unit of consensus.
const envelopeSchema = z.object({
	reading: z.object({
		chainSelector: uint,
		meterId: hex(32),
		consumer: hex(20),
		supplierId: uint,
		sequence: uint,
		periodStart: uint,
		periodEnd: uint,
		energyWh: uint,
		thdBps: uint,
		pfBps: uint,
		policyHash: hex(32),
	}),
	signature: z.string().regex(/^0x[0-9a-fA-F]+$/),
})

// Mirrors DESReadingReceiver (struct, READING_TYPEHASH, tariff limits).
const READING_TYPES = {
	Reading: [
		{ name: 'chainSelector', type: 'uint64' },
		{ name: 'meterId', type: 'bytes32' },
		{ name: 'consumer', type: 'address' },
		{ name: 'supplierId', type: 'uint256' },
		{ name: 'sequence', type: 'uint64' },
		{ name: 'periodStart', type: 'uint64' },
		{ name: 'periodEnd', type: 'uint64' },
		{ name: 'energyWh', type: 'uint256' },
		{ name: 'thdBps', type: 'uint16' },
		{ name: 'pfBps', type: 'uint16' },
		{ name: 'policyHash', type: 'bytes32' },
	],
} as const
const MAX_READING_AGE = 600n
const MAX_CLOCK_SKEW = 30n
const MAX_ENERGY_WH = 10_000n

const receiverAbi = parseAbi(['function nextSequence() view returns (uint64)', 'function lastPeriodEnd() view returns (uint64)'])

const readUint64 = (runtime: Runtime<Config>, evm: EVMClient, fn: 'nextSequence' | 'lastPeriodEnd'): bigint => {
	const res = evm
		.callContract(runtime, {
			call: encodeCallMsg({
				from: zeroAddress,
				to: runtime.config.receiverAddress as Address,
				data: encodeFunctionData({ abi: receiverAbi, functionName: fn }),
			}),
			blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
		})
		.result()
	if (res.data.length === 0) throw new Error(`no contract data from ${runtime.config.receiverAddress}.${fn}() (receiverAddress is a placeholder or not deployed)`)
	return decodeFunctionResult({ abi: receiverAbi, functionName: fn, data: bytesToHex(res.data) }) as bigint
}

// Runs on every DON node. Returns the raw body so identical aggregation compares the exact signed envelope.
const fetchEnvelope = (sendRequester: HTTPSendRequester, url: string): string => {
	const res = sendRequester.sendRequest({ method: 'GET', url }).result()
	if (res.statusCode !== 200) throw new Error(`meter API status ${res.statusCode}`)
	return new TextDecoder().decode(res.body)
}

/** Returns the abi-encoded report, or a string reason when the reading must not be written. */
export const validate = (
	body: string,
	cfg: Config,
	chain: { nextSequence: bigint; lastPeriodEnd: bigint; nowSec: bigint },
): { ok: true; report: Hex } | { ok: false; reason: string } => {
	const parsed = envelopeSchema.safeParse(safeJson(body))
	if (!parsed.success) return { ok: false, reason: `schema: ${parsed.error.issues[0]?.message}` }
	const { reading: w, signature } = parsed.data
	const r = {
		chainSelector: BigInt(w.chainSelector),
		meterId: w.meterId as Hex,
		consumer: w.consumer as Address,
		supplierId: BigInt(w.supplierId),
		sequence: BigInt(w.sequence),
		periodStart: BigInt(w.periodStart),
		periodEnd: BigInt(w.periodEnd),
		energyWh: BigInt(w.energyWh),
		thdBps: Number(w.thdBps),
		pfBps: Number(w.pfBps),
		policyHash: w.policyHash as Hex,
	}

	const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
	if (r.chainSelector !== BigInt(cfg.chainSelector)) return { ok: false, reason: 'chainSelector mismatch' }
	if (!eq(r.meterId, cfg.meterId)) return { ok: false, reason: 'meterId mismatch' }
	if (!eq(r.consumer, cfg.consumer)) return { ok: false, reason: 'consumer mismatch' }
	if (r.supplierId !== BigInt(cfg.supplierId)) return { ok: false, reason: 'supplierId mismatch' }
	if (!eq(r.policyHash, cfg.policyHash)) return { ok: false, reason: 'policyHash mismatch' }
	if (r.sequence !== chain.nextSequence) return { ok: false, reason: `sequence ${r.sequence} != nextSequence ${chain.nextSequence}` }
	if (r.periodStart >= r.periodEnd) return { ok: false, reason: 'invalid period' }
	if (r.periodStart < chain.lastPeriodEnd) return { ok: false, reason: 'period overlaps lastPeriodEnd' }
	if (r.periodEnd > chain.nowSec + MAX_CLOCK_SKEW) return { ok: false, reason: 'periodEnd in the future' }
	if (r.periodEnd < chain.nowSec && chain.nowSec - r.periodEnd > MAX_READING_AGE) return { ok: false, reason: 'reading too old' }
	if (r.energyWh === 0n || r.energyWh > MAX_ENERGY_WH) return { ok: false, reason: 'energyWh out of range' }
	if (r.thdBps > 10_000 || r.pfBps > 10_000) return { ok: false, reason: 'bps out of range' }

	const digest = hashTypedData({
		domain: { name: 'DESReadingReceiver', version: '1', chainId: cfg.chainId, verifyingContract: cfg.receiverAddress as Address },
		types: READING_TYPES,
		primaryType: 'Reading',
		message: r,
	})
	const signer = recoverSigner(digest, signature as Hex)
	if (!signer || !eq(signer, cfg.meterSigner)) return { ok: false, reason: 'signature does not recover to meterSigner' }

	// Solidity abi.encode(Reading, bytes): a dynamic outer tuple, so the struct is one tuple parameter.
	const report = encodeAbiParameters(
		[{ type: 'tuple', components: [...READING_TYPES.Reading] }, { type: 'bytes' }],
		[r, signature as Hex],
	)
	return { ok: true, report }
}

// Sync recovery (async API is unusable inside a CRE handler). Rejects high-s like OpenZeppelin ECDSA.
const recoverSigner = (digest: Hex, signature: Hex): Address | null => {
	try {
		const b = hexToBytes(signature)
		if (b.length !== 65) return null
		const sig = secp256k1.Signature.fromCompact(b.slice(0, 64))
		if (sig.s > secp256k1.CURVE.n >> 1n) return null
		const v = b[64] >= 27 ? b[64] - 27 : b[64]
		if (v > 1) return null
		return publicKeyToAddress(`0x${sig.addRecoveryBit(v).recoverPublicKey(hexToBytes(digest)).toHex(false)}`)
	} catch {
		return null
	}
}

const safeJson = (s: string): unknown => {
	try {
		return JSON.parse(s)
	} catch {
		return null
	}
}

const onCron = (runtime: Runtime<Config>): string => {
	const cfg = runtime.config
	const network = getNetwork({ chainFamily: 'evm', chainSelectorName: cfg.chainName, isTestnet: true })
	if (!network) throw new Error(`unknown chain ${cfg.chainName}`)
	const evm = new EVMClient(network.chainSelector.selector)

	const nextSequence = readUint64(runtime, evm, 'nextSequence')
	const lastPeriodEnd = readUint64(runtime, evm, 'lastPeriodEnd')
	runtime.log(`receiver nextSequence=${nextSequence} lastPeriodEnd=${lastPeriodEnd}`)

	// The meter binds its signature to (chainId, receiver, chainSelector) from these query params.
	const url =
		`${cfg.meterApiUrl}/meters/${cfg.meterId}/readings/${nextSequence}` +
		`?chainId=${cfg.chainId}&receiver=${cfg.receiverAddress}&chainSelector=${cfg.chainSelector}`
	const body = new HTTPClient()
		.sendRequest(runtime, fetchEnvelope, consensusIdenticalAggregation<string>())(url)
		.result()

	const nowSec = BigInt(Math.floor(runtime.now().getTime() / 1000))
	const v = validate(body, cfg, { nextSequence, lastPeriodEnd, nowSec })
	if (!v.ok) {
		runtime.log(`reading rejected, nothing written: ${v.reason}`)
		return `rejected: ${v.reason}`
	}

	const signed = runtime
		.report({ encodedPayload: hexToBase64(v.report), encoderName: 'evm', signingAlgo: 'ecdsa', hashingAlgo: 'keccak256' })
		.result()
	const res = evm
		.writeReport(runtime, { receiver: cfg.receiverAddress, report: signed, gasConfig: { gasLimit: cfg.gasLimit } })
		.result()

	const txHash = bytesToHex(res.txHash ?? new Uint8Array(32))
	runtime.log(`writeReport txStatus=${TxStatus[res.txStatus]} receiver=${res.receiverContractExecutionStatus === 1 ? 'REVERTED' : 'SUCCESS'} tx=${txHash}`)
	if (res.txStatus !== TxStatus.SUCCESS) throw new Error(`writeReport failed: ${res.errorMessage ?? TxStatus[res.txStatus]}`)
	return txHash
}

export function initWorkflow(config: Config) {
	return [handler(new CronCapability().trigger({ schedule: config.schedule }), onCron)]
}
