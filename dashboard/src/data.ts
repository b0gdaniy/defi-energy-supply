import { createPublicClient, http, parseAbi, type Address } from "viem";

export const START_BLOCK = 24535086n;
export const EXPLORER = "https://explorer.arc.io";
export const MAIN: Address = "0x60157fe5101bcD5168653841Df6Ee0a7BB49B5F8";
export const ORACLE: Address = "0x1ee86eA9De1954a04e0DeF1E101CD99D050bDa99";
export const ESCROW: Address = "0xf94f258B6D0B78724864Db76C58E97c7F0C40d9D";

const DIRECT_RPCS = [
  { url: "https://rpc.blockdaemon.mainnet.arc.io", maxRange: 100000n },
  { url: "https://rpc.drpc.mainnet.arc.io", maxRange: 10000n },
] as const;

type Rpc = { url: string; maxRange: bigint };

// Browser: same-origin proxy first (avoids CORS / tracking-protection blocks), then direct RPCs.
// Node (scripts/check-totals.mjs): direct RPCs only.
export const RPCS: readonly Rpc[] =
  typeof location !== "undefined" && /^https?:$/.test(location.protocol)
    ? [{ url: `${location.origin}/api/rpc`, maxRange: 100000n }, ...DIRECT_RPCS]
    : DIRECT_RPCS;

export const CONTRACTS: { name: string; symbol?: string; address: Address; role: string }[] = [
  { name: "Main", address: MAIN, role: "Entry point and fee settings" },
  { name: "Register", address: "0xf36BE8463c25e9AA235185dfbe344Fc486Ba7889", role: "Participant registry" },
  { name: "EnergyOracle", address: ORACLE, role: "Prices, production and consumption readings" },
  { name: "Escrow", address: ESCROW, role: "Pays suppliers in native USDC" },
  { name: "StakingReward", address: "0x7364f9bf517FcB23a883bEb11cacEf7D1254bb7c", role: "Staking rewards" },
  { name: "EnergyCreditToken", symbol: "NRGCT", address: "0xaDcDaBD5b96Af2c89829128321d913CF939d8604", role: "Energy credit token" },
  { name: "MicrogridGovernanceToken", symbol: "MGT", address: "0x100FEb2D822CBb32C4e8f047D43615AC8851Ed79", role: "Governance token" },
  { name: "EnergyProducerToken", symbol: "NRGPT", address: "0x9e3743dEC51b82BD83d7fF7557650BF1C75ee096", role: "Producer role token" },
  { name: "EnergySupplierToken", symbol: "NRGST", address: "0xdBe4bE33Af0a1671CCf4B6834E5F67bDa7250C42", role: "Supplier role token" },
  { name: "EnergyOracleProviderToken", symbol: "NRGOPT", address: "0x1F413a58aa40Ed00ABdD2e61Ef87C27Af1200a9d", role: "Oracle provider role token" },
  { name: "ElectricityConsumerToken", symbol: "ELCT", address: "0x21e633FAE68838d3B517EBE72f4d01b18dC2b815", role: "Consumer role token" },
];

const abi = parseAbi([
  "event EnergyPriceRecorded(address indexed sender, uint256 indexed supplierId, uint256 price, uint256 timestamp)",
  "event EnergyProductionRecorded(address indexed sender, address indexed supplier, uint256 indexed producerId, uint256 production, uint256 timestamp)",
  "event EnergyConsumptionRecorded(address indexed sender, address indexed whoseConsumption, uint256 indexed supplierId, uint256 consumption, uint256 timestamp)",
  "event PaidForEnergy(address indexed consumer, uint256 indexed supplierId, address indexed supplier, uint256 amount)",
]);

const feesAbi = [
  {
    type: "function",
    name: "fees",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "receiver", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
  },
] as const;

export type RawLog = {
  eventName: "EnergyPriceRecorded" | "EnergyProductionRecorded" | "EnergyConsumptionRecorded" | "PaidForEnergy";
  blockNumber: bigint;
  logIndex: number;
  transactionHash: string;
  args: Record<string, any>;
};

export type Reading = {
  blockNumber: bigint;
  logIndex: number;
  time: number; // unix seconds, from the event timestamp argument
  consumer: string;
  supplierId: bigint;
  wh: bigint;
  priceInEffect: bigint | null; // USDC base units per Wh
  charge: bigint | null; // USDC base units
  txHash: string;
  payment: { txHash: string; amount: bigint; blockNumber: bigint } | null;
};

export type Aggregate = {
  producedWh: bigint;
  consumedWh: bigint;
  paidUsdc: bigint;
  feesUsdc: bigint;
  readingCount: number;
  productionCount: number;
  paymentCount: number;
  priceCount: number;
  readings: Reading[]; // chain order (oldest first)
  prices: bigint[];
  payments: bigint[];
};

const pos = (l: { blockNumber: bigint; logIndex: number }) => l.blockNumber * 1_000_000n + BigInt(l.logIndex);

export function aggregate(logsIn: RawLog[], feePerPayment: bigint): Aggregate {
  const logs = [...logsIn].sort((a, b) => (pos(a) < pos(b) ? -1 : pos(a) > pos(b) ? 1 : 0));
  const priceBySupplier = new Map<string, bigint>();
  const pendingPayments = new Map<string, Reading[]>();
  const readings: Reading[] = [];
  const prices: bigint[] = [];
  const payments: bigint[] = [];
  let producedWh = 0n,
    consumedWh = 0n,
    paidUsdc = 0n,
    productionCount = 0;

  for (const l of logs) {
    const a = l.args;
    if (l.eventName === "EnergyPriceRecorded") {
      priceBySupplier.set(String(a.supplierId), a.price);
      prices.push(a.price);
    } else if (l.eventName === "EnergyProductionRecorded") {
      producedWh += a.production;
      productionCount++;
    } else if (l.eventName === "EnergyConsumptionRecorded") {
      consumedWh += a.consumption;
      const price = priceBySupplier.get(String(a.supplierId)) ?? null;
      const r: Reading = {
        blockNumber: l.blockNumber,
        logIndex: l.logIndex,
        time: Number(a.timestamp),
        consumer: a.whoseConsumption,
        supplierId: a.supplierId,
        wh: a.consumption,
        priceInEffect: price,
        charge: price === null ? null : price * a.consumption,
        txHash: l.transactionHash,
        payment: null,
      };
      readings.push(r);
      const key = `${String(a.whoseConsumption).toLowerCase()}:${a.supplierId}`;
      const q = pendingPayments.get(key) ?? [];
      q.push(r);
      pendingPayments.set(key, q);
    } else if (l.eventName === "PaidForEnergy") {
      paidUsdc += a.amount;
      payments.push(a.amount);
      const key = `${String(a.consumer).toLowerCase()}:${a.supplierId}`;
      const q = pendingPayments.get(key);
      const r = q?.shift();
      if (r) r.payment = { txHash: l.transactionHash, amount: a.amount, blockNumber: l.blockNumber };
    }
  }
  return {
    producedWh,
    consumedWh,
    paidUsdc,
    feesUsdc: BigInt(payments.length) * feePerPayment,
    readingCount: readings.length,
    productionCount,
    paymentCount: payments.length,
    priceCount: prices.length,
    readings,
    prices,
    payments,
  };
}

export type DashboardData = {
  rpc: string;
  latestBlock: bigint;
  fetchedAt: number;
  fee: bigint;
  agg: Aggregate;
};

async function readFrom(rpc: Rpc): Promise<Omit<DashboardData, "agg"> & { logs: RawLog[] }> {
  const client = createPublicClient({ transport: http(rpc.url, { timeout: 20000, retryCount: 1 }) });
  const latestBlock = await client.getBlockNumber();
  const ranges: [bigint, bigint][] = [];
  for (let from = START_BLOCK; from <= latestBlock; from += rpc.maxRange) {
    const to = from + rpc.maxRange - 1n;
    ranges.push([from, to > latestBlock ? latestBlock : to]);
  }
  const chunks: RawLog[][] = [];
  for (let i = 0; i < ranges.length; i += 4) {
    const batch = await Promise.all(
      ranges.slice(i, i + 4).map(([fromBlock, toBlock]) =>
        client.getLogs({ address: [ORACLE, ESCROW], events: abi, fromBlock, toBlock }) as unknown as Promise<RawLog[]>,
      ),
    );
    chunks.push(...batch);
  }
  const fees = (await client.readContract({ address: MAIN, abi: feesAbi, functionName: "fees" })) as { amount: bigint };
  return { rpc: rpc.url, latestBlock, fetchedAt: Date.now(), fee: fees.amount, logs: chunks.flat() };
}

export async function fetchDashboardData(): Promise<DashboardData> {
  const errors: string[] = [];
  for (const rpc of RPCS) {
    try {
      const { logs, ...meta } = await readFrom(rpc);
      return { ...meta, agg: aggregate(logs, meta.fee) };
    } catch (e: any) {
      errors.push(`${rpc.url}: ${e?.shortMessage ?? e?.message ?? String(e)}`);
    }
  }
  throw new Error(`Could not read Arc mainnet. Endpoints tried (in order): ${errors.join(" | ")}`);
}

export function formatUsdc(v: bigint, maxDecimals = 6): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const whole = abs / 1_000_000n;
  let frac = (abs % 1_000_000n).toString().padStart(6, "0").slice(0, maxDecimals).replace(/0+$/, "");
  if (frac.length < 2 && maxDecimals >= 2) frac = frac.padEnd(2, "0");
  return `${neg ? "-" : ""}${whole.toLocaleString("en-US")}${frac ? "." + frac : ""}`;
}

export function formatKwh(wh: bigint): string {
  const w = wh / 1000n;
  const f = (wh % 1000n).toString().padStart(3, "0").replace(/0+$/, "");
  return `${w.toLocaleString("en-US")}${f ? "." + f : ""}`;
}

/** Price is USDC base units per Wh; per kWh is price * 1000 base units. */
export function formatPricePerKwh(price: bigint): string {
  return formatUsdc(price * 1000n, 6);
}
