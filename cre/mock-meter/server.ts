import { Meter, type Target } from './meter'

const env = (n: string, d?: string) => {
	const v = process.env[n] ?? d
	if (!v) throw new Error(`missing env ${n} (see .env.example)`)
	return v
}

const meter = new Meter(
	{
		privateKey: env('METER_PRIVATE_KEY') as `0x${string}`,
		meterId: env('METER_ID') as `0x${string}`,
		consumer: env('CONSUMER') as `0x${string}`,
		supplierId: BigInt(env('SUPPLIER_ID')),
		policyHash: env('POLICY_HASH') as `0x${string}`,
	},
	new URL('./readings.json', import.meta.url).pathname,
)

// Target binding: query params win, env is the fallback (one meter process per target is the simple setup).
function target(url: URL): Target {
	return {
		chainId: Number(url.searchParams.get('chainId') ?? env('CHAIN_ID')),
		receiver: (url.searchParams.get('receiver') ?? env('RECEIVER_ADDRESS')) as `0x${string}`,
		chainSelector: BigInt(url.searchParams.get('chainSelector') ?? env('CHAIN_SELECTOR')),
	}
}

const server = Bun.serve({
	port: Number(process.env.PORT ?? 8787),
	async fetch(req) {
		const url = new URL(req.url)
		const m = url.pathname.match(/^\/meters\/(0x[0-9a-fA-F]{64})\/readings\/(\d+)$/)
		if (!m) return new Response('not found', { status: 404 })
		if (m[1].toLowerCase() !== env('METER_ID').toLowerCase()) return new Response('unknown meter', { status: 404 })
		const seq = Number(m[2])
		if (!Number.isSafeInteger(seq) || seq < 1) return new Response('bad sequence', { status: 400 })

		const body = await meter.get(target(url), seq)
		if (body === null) return new Response('period not finished, retry later', { status: 425 })
		return new Response(body, { headers: { 'content-type': 'application/json' } })
	},
})
console.log(`mock meter (SIMULATED data) signer ${meter.address} on :${server.port}`)
