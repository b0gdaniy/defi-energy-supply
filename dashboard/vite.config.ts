import { defineConfig, type Plugin } from "vite";
import { handleRpc, MAX_BODY_BYTES } from "./lib/rpcProxy.js";

// Serves /api/rpc under `vite dev` and `vite preview` with the same pure handler
// that api/rpc.ts uses on Vercel.
function rpcProxy(): Plugin {
  const middleware = (req: any, res: any, next: () => void) => {
    const path = (req.url ?? "").split("?")[0];
    if (path !== "/api/rpc") return next();
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("content-type", "application/json");
      res.setHeader("allow", "POST");
      res.end(JSON.stringify({ error: "POST only" }));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let tooBig = false;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) tooBig = true;
      else chunks.push(c);
    });
    req.on("end", async () => {
      const body = tooBig ? "x".repeat(MAX_BODY_BYTES + 1) : Buffer.concat(chunks).toString("utf8");
      try {
        const out = await handleRpc(body);
        res.statusCode = out.status;
        res.setHeader("content-type", "application/json");
        if (out.cacheControl) res.setHeader("cache-control", out.cacheControl);
        res.end(out.body);
      } catch {
        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "proxy failure" }));
      }
    });
  };
  return {
    name: "local-rpc-proxy",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({ plugins: [rpcProxy()] });
