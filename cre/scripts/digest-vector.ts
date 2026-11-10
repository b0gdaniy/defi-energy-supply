// Prints the EIP-712 digest, a deterministic signature and the abi-encoded report for a fixed Reading.
// foundry/test/DESReadingDigestVector.t.sol asserts the same constants, so TS and Solidity must agree.
// Run: bun run digest-vector   (from cre/scripts)
import { encodeAbiParameters, hashTypedData, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

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

const CHAIN_ID = 31337
const RECEIVER = '0x00000000000000000000000000000000000d3516' as const
const KEY = '0x0000000000000000000000000000000000000000000000000000000000000001' as const // vector only, public

const reading = {
	chainSelector: 10344971235874465080n,
	meterId: `0x${'11'.repeat(32)}` as Hex,
	consumer: '0x000000000000000000000000000000000000dEaD' as const,
	supplierId: 7n,
	sequence: 3n,
	periodStart: 1_700_000_000n,
	periodEnd: 1_700_000_060n,
	energyWh: 1500n,
	thdBps: 1200,
	pfBps: 9000,
	policyHash: '0xb7ac31c3a7df955e9c91398a82e7d17dfa24e72fa368175c91977ef889e9f266' as Hex,
}

const domain = { name: 'DESReadingReceiver', version: '1', chainId: CHAIN_ID, verifyingContract: RECEIVER } as const
const digest = hashTypedData({ domain, types: READING_TYPES, primaryType: 'Reading', message: reading })
const signature = await privateKeyToAccount(KEY).signTypedData({ domain, types: READING_TYPES, primaryType: 'Reading', message: reading })
const report = encodeAbiParameters(
	[{ type: 'tuple', components: [...READING_TYPES.Reading] }, { type: 'bytes' }],
	[reading, signature],
)

console.log(JSON.stringify({ chainId: CHAIN_ID, receiver: RECEIVER, digest, signature, report }, null, 2))
