import { fetchDashboardData } from "../src/data.ts";

const d = await fetchDashboardData();
const a = d.agg;
const first = (arr, n = 5) => arr.slice(0, n).map(Number);
const out = {
  rpc: d.rpc,
  latestBlock: Number(d.latestBlock),
  feePerPayment: Number(d.fee),
  producedWh: Number(a.producedWh),
  consumedWh: Number(a.consumedWh),
  paidUsdcBaseUnits: Number(a.paidUsdc),
  feesUsdcBaseUnits: Number(a.feesUsdc),
  readings: a.readingCount,
  productionEvents: a.productionCount,
  priceEvents: a.priceCount,
  payments: a.paymentCount,
  firstConsumption: first(a.readings.map((r) => r.wh)),
  firstPrices: first(a.prices),
  firstPayments: first(a.payments),
  firstFivePaymentSum: first(a.payments).reduce((x, y) => x + y, 0),
  firstFiveMatched: a.readings.slice(0, 5).map((r) => !!r.payment),
};
console.log(JSON.stringify(out, null, 2));

const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const fails = [];
if (!(out.producedWh >= 10000)) fails.push("producedWh < 10000");
if (!eq(out.firstConsumption, [1500, 2100, 1800, 2400, 1200])) fails.push("first consumption mismatch");
if (!eq(out.firstPrices, [120, 108, 126, 113, 120])) fails.push("first prices mismatch");
if (!eq(out.firstPayments, [180000, 226800, 226800, 271200, 144000])) fails.push("first payments mismatch");
if (out.firstFivePaymentSum !== 1048800) fails.push("first five payment sum != 1048800");
if (!out.firstFiveMatched.every(Boolean)) fails.push("first five readings not all matched to payments");
if (fails.length) {
  console.error("CHECK FAILED:\n- " + fails.join("\n- "));
  process.exit(1);
}
console.log("CHECK OK");
