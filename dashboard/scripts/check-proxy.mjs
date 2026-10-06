import { handleRpc } from "../lib/rpcProxy.ts";

const ESCROW = "0xf94f258B6D0B78724864Db76C58E97c7F0C40d9D";
const fails = [];
const ok = (name, cond, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
  if (!cond) fails.push(name);
};
const call = async (body) => {
  const r = await handleRpc(typeof body === "string" ? body : JSON.stringify(body), fetch);
  return { r, j: JSON.parse(r.body) };
};
const rq = (method, params = []) => ({ jsonrpc: "2.0", id: 1, method, params });

let { j } = await call(rq("eth_chainId"));
ok("eth_chainId = 0x13b2", j.result === "0x13b2", j.result);

({ j } = await call(rq("eth_blockNumber")));
ok("eth_blockNumber > START", typeof j.result === "string" && BigInt(j.result) > 24535086n, j.result);

// viem omits params for eth_blockNumber; JSON-RPC 2.0 allows that.
({ j } = await call({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber" }));
ok("eth_blockNumber without params", typeof j.result === "string", JSON.stringify(j.error ?? j.result));

({ j } = await call(rq("eth_getLogs", [{ address: ESCROW, fromBlock: "0x" + (24535086).toString(16), toBlock: "0x" + (24544000).toString(16) }])));
ok("eth_getLogs escrow >= 5 logs", Array.isArray(j.result) && j.result.length >= 5, String(j.result?.length ?? JSON.stringify(j.error)));

({ j } = await call(rq("eth_sendRawTransaction", ["0x00"])));
ok("eth_sendRawTransaction rejected", j.error?.code === -32601, JSON.stringify(j.error));

({ j } = await call(rq("eth_getLogs", [{ address: "0x0000000000000000000000000000000000000001", fromBlock: "0x1", toBlock: "0x2" }])));
ok("foreign address rejected", !!j.error && j.result === undefined, JSON.stringify(j.error));

({ j } = await call(rq("eth_getLogs", [{ address: ESCROW, fromBlock: "0x" + (24535086).toString(16), toBlock: "0x" + (24735086).toString(16) }])));
ok("range 200000 rejected", !!j.error && j.result === undefined, JSON.stringify(j.error));

({ j } = await call([rq("eth_chainId")]));
ok("batch rejected", !!j.error, JSON.stringify(j.error));

({ j } = await call(rq("eth_getBlockByNumber", ["latest", true])));
ok("full-tx block rejected", !!j.error, JSON.stringify(j.error));

if (fails.length) {
  console.error("CHECK PROXY FAILED: " + fails.join(", "));
  process.exit(1);
}
console.log("CHECK PROXY OK");
