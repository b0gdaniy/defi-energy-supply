import { handleRpc } from "../lib/rpcProxy.js";

// Vercel Function (Web Handler, fetch export): same-origin JSON-RPC proxy for Arc mainnet.
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { "content-type": "application/json", allow: "POST" },
      });
    }
    const out = await handleRpc(await request.text());
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (out.cacheControl) headers["cache-control"] = out.cacheControl;
    return new Response(out.body, { status: out.status, headers });
  },
};
