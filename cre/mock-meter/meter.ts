import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { privateKeyToAccount } from 'viem/accounts'
import scenario from './scenario.json'

// EIP-712 type of DESReadingReceiver.Reading. Must match READING_TYPEHASH onchain.
export const READING_TYPES = {
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

export type MeterConfig = {
	privateKey: `0x${string}`
	meterId: `0x${string}`
	consumer: `0x${string}`
	supplierId: bigint
	policyHash: `0x${string}`
}

/** Per-request target: which chain and receiver the signature is bound to. */
export type Target = { chainId: number; receiver: `0x${string}`; chainSelector: bigint }

export class Meter {
	// key -> exact JSON body. Stored as a string so every caller gets identical bytes.
	private cache: Record<string, string> = {}

	constructor(
		private cfg: MeterConfig,
		private storePath?: string,
		private nowSec: () => number = () => Math.floor(Date.now() / 1000),
	) {
		if (storePath && existsSync(storePath)) this.cache = JSON.parse(readFileSync(storePath, 'utf8'))
	}

	get address() {
		return privateKeyToAccount(this.cfg.privateKey).address
	}

	private key(t: Target, seq: number) {
		return `${this.cfg.meterId}:${t.chainId}:${t.receiver.toLowerCase()}:${seq}`
	}

	/** Returns the cached body, or creates it. Returns null when the 60 s period is not over yet. */
	async get(t: Target, seq: number): Promise<string | null> {
		const k = this.key(t, seq)
		if (this.cache[k]) return this.cache[k]

		const prev = this.cache[this.key(t, seq - 1)]
		const prevEnd = prev ? BigInt(JSON.parse(prev).reading.periodEnd) : 0n
		const periodEnd = BigInt(Math.floor(this.nowSec() / 60) * 60)
		if (periodEnd <= prevEnd) return null
		const periodStart = periodEnd - 60n > prevEnd ? periodEnd - 60n : prevEnd

		const step = scenario.cycle[(seq - 1) % scenario.cycle.length]
		const reading = {
			chainSelector: t.chainSelector,
			meterId: this.cfg.meterId,
			consumer: this.cfg.consumer,
			supplierId: this.cfg.supplierId,
			sequence: BigInt(seq),
			periodStart,
			periodEnd,
			energyWh: BigInt(step.energyWh),
			thdBps: step.thdBps,
			pfBps: step.pfBps,
			policyHash: this.cfg.policyHash,
		}
		const signature = await privateKeyToAccount(this.cfg.privateKey).signTypedData({
			domain: { name: 'DESReadingReceiver', version: '1', chainId: t.chainId, verifyingContract: t.receiver },
			types: READING_TYPES,
			primaryType: 'Reading',
			message: reading,
		})
		const body = JSON.stringify({
			simulated: true,
			scenario: step.name,
			reading: Object.fromEntries(Object.entries(reading).map(([n, v]) => [n, String(v)])),
			signature,
		})
		this.cache[k] = body
		if (this.storePath) writeFileSync(this.storePath, JSON.stringify(this.cache, null, 2))
		return body
	}
}
