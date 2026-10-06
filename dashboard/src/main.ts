import "./style.css";
import {
  CONTRACTS,
  EXPLORER,
  fetchDashboardData,
  formatKwh,
  formatPricePerKwh,
  formatUsdc,
  type DashboardData,
  type Reading,
} from "./data";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const short = (s: string) => `${s.slice(0, 6)}...${s.slice(-4)}`;

function link(href: string, text: string, cls?: string): HTMLAnchorElement {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = text;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  if (cls) a.className = cls;
  return a;
}

function cell(tr: HTMLElement, content: string | Node, cls?: string) {
  const td = document.createElement("td");
  if (cls) td.className = cls;
  td.append(content);
  tr.append(td);
}

function renderRow(r: Reading): HTMLElement {
  const tr = document.createElement("tr");
  cell(tr, r.blockNumber.toString(), "n");
  cell(tr, new Date(r.time * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
  cell(tr, link(`${EXPLORER}/address/${r.consumer}`, short(r.consumer), "addr"));
  cell(tr, r.wh.toLocaleString("en-US"), "n");
  cell(tr, r.priceInEffect === null ? "none" : formatPricePerKwh(r.priceInEffect), "n");
  cell(tr, r.charge === null ? "none" : formatUsdc(r.charge), "n");
  cell(tr, link(`${EXPLORER}/tx/${r.txHash}`, short(r.txHash), "addr"));
  if (r.payment) cell(tr, link(`${EXPLORER}/tx/${r.payment.txHash}`, short(r.payment.txHash), "addr"));
  else {
    const s = document.createElement("span");
    s.className = "unpaid";
    s.textContent = "unpaid";
    cell(tr, s);
  }
  return tr;
}

function render(d: DashboardData) {
  const a = d.agg;
  $("block").textContent = d.latestBlock.toLocaleString("en-US");
  $("updated").textContent = new Date(d.fetchedAt).toLocaleTimeString();
  $("k-paid").textContent = formatUsdc(a.paidUsdc);
  $("k-prod").textContent = `${a.producedWh.toLocaleString("en-US")} Wh`;
  $("k-prod-s").textContent = `${formatKwh(a.producedWh)} kWh in ${a.productionCount} report${a.productionCount === 1 ? "" : "s"}`;
  $("k-cons").textContent = `${a.consumedWh.toLocaleString("en-US")} Wh`;
  $("k-cons-s").textContent = `${formatKwh(a.consumedWh)} kWh`;
  $("k-fees").textContent = `${formatUsdc(a.feesUsdc)} USDC`;
  $("k-fees-s").textContent = `${a.paymentCount} payments at ${formatUsdc(d.fee)} USDC each`;
  $("k-read").textContent = String(a.readingCount);
  $("k-read-s").textContent = `${a.priceCount} price update${a.priceCount === 1 ? "" : "s"}`;
  $("k-pay").textContent = String(a.paymentCount);
  $("k-pay-s").textContent = `${a.readings.filter((r) => !r.payment).length} reading(s) unpaid`;

  const max = a.producedWh > a.consumedWh ? a.producedWh : a.consumedWh;
  const pct = (v: bigint) => (max === 0n ? 0 : Number((v * 10000n) / max) / 100);
  $("bar-prod").style.width = `${pct(a.producedWh)}%`;
  $("bar-cons").style.width = `${pct(a.consumedWh)}%`;

  const rows = $("rows");
  rows.replaceChildren();
  if (a.readings.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "empty";
    td.textContent = "No consumption readings recorded on-chain yet. New readings appear here after the next refresh.";
    tr.append(td);
    rows.append(tr);
  } else {
    for (const r of [...a.readings].reverse()) rows.append(renderRow(r));
  }
}

function setStatus(kind: "" | "loading" | "error", msg: string) {
  const el = $("status");
  el.className = `status ${kind}`;
  el.textContent = msg;
  $("dot").className = `dot ${kind}`;
}

let busy = false;
let loaded = false;
async function load() {
  if (busy) return;
  busy = true;
  $<HTMLButtonElement>("refresh").disabled = true;
  if (!loaded) setStatus("loading", "Reading events from Arc mainnet...");
  try {
    const d = await fetchDashboardData();
    render(d);
    loaded = true;
    setStatus("", "");
  } catch (e: any) {
    setStatus("error", loaded ? `Refresh failed, showing the last data. ${e.message}` : e.message);
  } finally {
    busy = false;
    $<HTMLButtonElement>("refresh").disabled = false;
  }
}

function renderContracts() {
  const ul = $("contracts");
  for (const c of CONTRACTS) {
    const li = document.createElement("li");
    const name = document.createElement("strong");
    name.textContent = c.symbol ? `${c.name} (${c.symbol})` : c.name;
    const role = document.createElement("span");
    role.className = "role";
    role.textContent = c.role;
    const ver = document.createElement("span");
    ver.className = "verified";
    ver.textContent = "source verified";
    li.append(name, role, link(`${EXPLORER}/address/${c.address}`, c.address, "addr full"), ver);
    ul.append(li);
  }
}

renderContracts();
$("refresh").addEventListener("click", load);
setInterval(() => {
  if (!document.hidden) load();
}, 30000);
load();
