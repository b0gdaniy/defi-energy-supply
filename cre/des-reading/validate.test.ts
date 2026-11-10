import { expect, test } from 'bun:test'
import { validate } from './workflow'
import cfgJson from './config.base.json'

// Envelope produced by cre/mock-meter for the placeholder receiver 0x0 on Base Sepolia (chainId 84532).
const body = `{"simulated":true,"scenario":"normal","reading":{"chainSelector":"10344971235874465080","meterId":"0x3d3fd68e62fe55c5ace7e50c015bf9462f804a23aa7b08589932f304186e8ab6","consumer":"0x000000000000000000000000000000000000dEaD","supplierId":"1","sequence":"1","periodStart":"1791297600","periodEnd":"1791297660","energyWh":"1500","thdBps":"300","pfBps":"9800","policyHash":"0xb7ac31c3a7df955e9c91398a82e7d17dfa24e72fa368175c91977ef889e9f266"},"signature":"0xab547abb75aecadf5bab75d0bbedabe43d0b611ba9b883174ad7e2e1faf65e211998679d0f61ae98395c3b8211db6ef8851b008e24d5670ed684d86459136ff01c"}`
const cfg = cfgJson as Parameters<typeof validate>[1]
const chain = { nextSequence: 1n, lastPeriodEnd: 0n, nowSec: 1791297700n }

test('accepts a valid signed reading and encodes a report', () => {
	const v = validate(body, cfg, chain)
	expect(v.ok).toBe(true)
	if (v.ok) expect(v.report.startsWith('0x')).toBe(true)
})

test('rejects wrong sequence, stale reading, wrong signer and bad JSON', () => {
	expect(validate(body, cfg, { ...chain, nextSequence: 2n })).toEqual({ ok: false, reason: 'sequence 1 != nextSequence 2' })
	expect(validate(body, cfg, { ...chain, nowSec: 1791297660n + 601n })).toEqual({ ok: false, reason: 'reading too old' })
	expect(validate(body, { ...cfg, meterSigner: '0x000000000000000000000000000000000000dEaD' }, chain)).toEqual({
		ok: false,
		reason: 'signature does not recover to meterSigner',
	})
	expect(validate('not json', cfg, chain).ok).toBe(false)
})
