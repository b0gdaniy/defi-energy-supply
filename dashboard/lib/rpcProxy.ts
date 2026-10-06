// Pure JSON-RPC proxy logic for /api/rpc. No Vercel imports, so it is testable in Node.

export const UPSTREAMS = [
  { url: "https://rpc.blockdaemon.mainnet.arc.io", maxRange: 100000n },
  { url: "https://rpc.drpc.mainnet.arc.io", maxRange: 10000n },
] as const;

export const MAX_BODY_BYTES = 8 * 1024;
const TIMEOUT_MS = 10_000;

export const ALLOWED_ADDRESSES = new Set(
  [
    "0x60157fe5101bcD5168653841Df6Ee0a7BB49B5F8",
    "0xf36BE8463c25e9AA235185dfbe344Fc486Ba7889",
    "0x1ee86eA9De1954a04e0DeF1E101CD99D050bDa99",
    "0xf94f258B6D0B78724864Db76C58E97c7F0C40d9D",
    "0x7364f9bf517FcB23a883bEb11cacEf7D1254bb7c",
    "0xaDcDaBD5b96Af2c89829128321d913CF939d8604",
    "0x100FEb2D822CBb32C4e8f047D43615AC8851Ed79",
    "0x9e3743dEC51b82BD83d7fF7557650BF1C75ee096",
    "0xdBe4bE33Af0a1671CCf4B6834E5F67bDa7250C42",
    "0x1F413a58aa40Ed00ABdD2e61Ef87C27Af1200a9d",
    "0x21e633FAE68838d3B517EBE72f4d01b18dC2b815",
    "0x3600000000000000000000000000000000000000",
  ].map((a) => a.toLowerCase()),
);

const SHORT_CACHE = "public, s-maxage=10, stale-while-revalidate=30";
const LONG_CACHE = "public, s-maxage=3600";
const CACHE: Record<string, string> = {
  eth_blockNumber: SHORT_CACHE,
  eth_getLogs: SHORT_CACHE,
  eth_call: SHORT_CACHE,
  eth_getBlockByNumber: LONG_CACHE,
  eth_chainId: LONG_CACHE,
};

export type FetchImpl = typeof fetch;
export type RpcResult = { status: number; body: string; cacheControl: string | null };

// Errors are returned with HTTP 200 and a JSON-RPC error object, consistently.
function rpcError(id: unknown, code: number, message: string): RpcResult {
  return {
    status: 200,
    body: JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }),
    cacheControl: "no-store",
  };
}

const isAllowed = (a: unknown) => typeof a === "string" && ALLOWED_ADDRESSES.has(a.toLowerCase());
const HEX_QTY = /^0x(0|[1-9a-fA-F][0-9a-fA-F]*)$/;

async function post(fetchImpl: FetchImpl, url: string, payload: unknown): Promise<any> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function resolveBlock(tag: unknown, fetchImpl: FetchImpl, cache: { latest?: bigint }): Promise<bigint | null> {
  if (typeof tag === "string" && HEX_QTY.test(tag)) return BigInt(tag);
  if (tag === undefined || tag === "latest" || tag === "finalized" || tag === "safe") {
    if (cache.latest === undefined) {
      const j = await post(fetchImpl, UPSTREAMS[0].url, { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] });
      if (typeof j?.result !== "string" || !HEX_QTY.test(j.result)) throw new Error("bad eth_blockNumber");
      cache.latest = BigInt(j.result);
    }
    return cache.latest;
  }
  return null; // "earliest", "pending", objects: not accepted
}

/** Validate a single JSON-RPC request. Returns an error result, or the log range (or null) on success. */
async function validate(req: any, fetchImpl: FetchImpl): Promise<{ error: RpcResult } | { range: bigint | null }> {
  const { id, method, params } = req;
  if (!Array.isArray(params)) return { error: rpcError(id, -32602, "params must be an array") };
  switch (method) {
    case "eth_chainId":
    case "eth_blockNumber":
      return { range: null };
    case "eth_getBlockByNumber":
      if (params[1] !== false) return { error: rpcError(id, -32602, "second param must be false") };
      return { range: null };
    case "eth_call": {
      const to = params[0]?.to;
      if (!isAllowed(to)) return { error: rpcError(id, -32602, "address not allowed") };
      return { range: null };
    }
    case "eth_getLogs": {
      const f = params[0];
      if (!f || typeof f !== "object" || Array.isArray(f)) return { error: rpcError(id, -32602, "invalid filter") };
      if (f.blockHash !== undefined) return { error: rpcError(id, -32602, "blockHash filter not allowed") };
      const addrs = Array.isArray(f.address) ? f.address : [f.address];
      if (addrs.length === 0 || !addrs.every(isAllowed)) return { error: rpcError(id, -32602, "address not allowed") };
      const cache: { latest?: bigint } = {};
      let from: bigint | null, to: bigint | null;
      try {
        from = await resolveBlock(f.fromBlock, fetchImpl, cache);
        to = await resolveBlock(f.toBlock, fetchImpl, cache);
      } catch (e: any) {
        return { error: rpcError(id, -32603, `could not resolve block range: ${e?.message ?? e}`) };
      }
      if (from === null || to === null) return { error: rpcError(id, -32602, "invalid block tag") };
      const range = to - from;
      if (range < 0n || range > UPSTREAMS[0].maxRange) return { error: rpcError(id, -32602, "block range too large (max 100000)") };
      return { range };
    }
    default:
      return { error: rpcError(id, -32601, `method not allowed: ${String(method)}`) };
  }
}

export async function handleRpc(rawBody: string, fetchImpl: FetchImpl = fetch): Promise<RpcResult> {
  if (rawBody.length > MAX_BODY_BYTES || new TextEncoder().encode(rawBody).length > MAX_BODY_BYTES) {
    return rpcError(null, -32600, "body too large (max 8 KB)");
  }
  let req: any;
  try {
    req = JSON.parse(rawBody);
  } catch {
    return rpcError(null, -32700, "parse error");
  }
  if (Array.isArray(req)) return rpcError(null, -32600, "batch requests not supported");
  if (!req || typeof req !== "object" || req.jsonrpc !== "2.0" || typeof req.method !== "string") {
    return rpcError(req?.id ?? null, -32600, "invalid request");
  }

  const v = await validate(req, fetchImpl);
  if ("error" in v) return v.error;

  const payload = { jsonrpc: "2.0", id: req.id ?? null, method: req.method, params: req.params };
  const cacheControl = CACHE[req.method] ?? null;
  let lastErr = "";
  let lastBody: any = null;
  for (let i = 0; i < UPSTREAMS.length; i++) {
    const up = UPSTREAMS[i];
    // dRPC free tier allows 10000 blocks for logs; skip it for larger ranges.
    if (req.method === "eth_getLogs" && v.range !== null && v.range > up.maxRange) continue;
    try {
      const j = await post(fetchImpl, up.url, payload);
      if (j && typeof j === "object" && !j.error) {
        return { status: 200, body: JSON.stringify(j), cacheControl };
      }
      lastBody = j;
      lastErr = `${up.url}: ${j?.error?.message ?? "bad response"}`;
    } catch (e: any) {
      lastErr = `${up.url}: ${e?.message ?? String(e)}`;
    }
  }
  if (lastBody && typeof lastBody === "object" && lastBody.error) {
    return { status: 200, body: JSON.stringify(lastBody), cacheControl: "no-store" };
  }
  return rpcError(req.id, -32603, `upstream unavailable: ${lastErr}`);
}
