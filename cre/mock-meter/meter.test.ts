import { expect, test } from 'bun:test'
import { recoverTypedDataAddress } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { Meter, READING_TYPES } from './meter'

// Throwaway key for the test only, never used with funds.
const KEY = generatePrivateKey()
const target = {
	chainId: 84532,
	receiver: '0x00000000000000000000000000000000000000aa' as const,
	chainSelector: 10344971235874465080n,
}
const cfg = {
	privateKey: KEY,
	meterId: `0x${'11'.repeat(32)}` as const,
	consumer: '0x00000000000000000000000000000000000000bb' as const,
	supplierId: 1n,
	policyHash: `0x${'22'.repeat(32)}` as const,
}

test('same (meter, sequence) returns identical bytes and recovers to the meter address', async () => {
	let t = 1_700_000_100
	const meter = new Meter(cfg, undefined, () => t)
	const a = await meter.get(target, 1)
	t += 30
	const b = await meter.get(target, 1)
	expect(a).not.toBeNull()
	expect(b).toBe(a)

	const { reading, signature } = JSON.parse(a!)
	const recovered = await recoverTypedDataAddress({
		domain: { name: 'DESReadingReceiver', version: '1', chainId: target.chainId, verifyingContract: target.receiver },
		types: READING_TYPES,
		primaryType: 'Reading',
		message: {
			chainSelector: BigInt(reading.chainSelector),
			meterId: reading.meterId,
			consumer: reading.consumer,
			supplierId: BigInt(reading.supplierId),
			sequence: BigInt(reading.sequence),
			periodStart: BigInt(reading.periodStart),
			periodEnd: BigInt(reading.periodEnd),
			energyWh: BigInt(reading.energyWh),
			thdBps: Number(reading.thdBps),
			pfBps: Number(reading.pfBps),
			policyHash: reading.policyHash,
		},
		signature,
	})
	expect(recovered).toBe(privateKeyToAccount(KEY).address)
})

test('periods chain without overlap and the scenario cycles', async () => {
	let t = 1_700_000_100
	const meter = new Meter(cfg, undefined, () => t)
	const r1 = JSON.parse((await meter.get(target, 1))!).reading
	expect(await meter.get(target, 2)).toBeNull() // same minute: previous period end is not behind us
	t += 60
	const s2 = JSON.parse((await meter.get(target, 2))!)
	expect(BigInt(s2.reading.periodStart) >= BigInt(r1.periodEnd)).toBe(true)
	expect(s2.reading.thdBps).toBe('1200')
	t += 60
	expect(JSON.parse((await meter.get(target, 3))!).reading.pfBps).toBe('9000')
})
