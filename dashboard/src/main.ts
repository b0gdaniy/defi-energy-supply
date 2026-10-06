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

const mq = window.matchMedia("(max-width: 639px)");
const addrText = (a: string) => (mq.matches ? short(a) : a);

function fmtTime(sec: number): string {
  const t = new Date(sec * 1000).toLocaleString("en-US", {
    timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  return `${t} UTC`;
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
  cell(tr, fmtTime(r.time));
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

function renderCard(r: Reading): HTMLElement {
  const li = document.createElement("li");
  const dl = document.createElement("dl");
  const add = (label: string, v: string | Node, cls = "") => {
    const row = document.createElement("div");
    if (cls) row.className = cls;
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.append(v);
    row.append(dt, dd);
    dl.append(row);
  };
  const unpaid = () => {
    const s = document.createElement("span");
    s.className = "unpaid";
    s.textContent = "unpaid";
    return s;
  };
  add("Energy (Wh)", r.wh.toLocaleString("en-US"), "lead");
  add("Charge (USDC)", r.charge === null ? "none" : formatUsdc(r.charge), "lead");
  add("Payment tx", r.payment ? link(`${EXPLORER}/tx/${r.payment.txHash}`, short(r.payment.txHash), "addr") : unpaid(), "lead");
  add("Price (USDC/kWh)", r.priceInEffect === null ? "none" : formatPricePerKwh(r.priceInEffect));
  add("Time", fmtTime(r.time));
  add("Block", r.blockNumber.toString());
  add("Consumer", link(`${EXPLORER}/address/${r.consumer}`, short(r.consumer), "addr"));
  add("Reading tx", link(`${EXPLORER}/tx/${r.txHash}`, short(r.txHash), "addr"));
  li.append(dl);
  return li;
}

let lastSig = "";
function render(d: DashboardData): boolean {
  const a = d.agg;
  $("block").textContent = d.latestBlock.toLocaleString("en-US");
  $("updated").textContent = `${new Date(d.fetchedAt).toISOString().slice(11, 19)} UTC`;
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
  const unpaidN = a.readings.filter((r) => !r.payment).length;
  $("k-pay-s").textContent = unpaidN === 0 ? "All readings paid" : unpaidN === 1 ? "1 reading unpaid" : `${unpaidN} readings unpaid`;
  $("lab-prod").textContent = `Produced ${formatKwh(a.producedWh)} kWh`;
  $("lab-cons").textContent = `Consumed ${formatKwh(a.consumedWh)} kWh`;
  const sig = [a.readingCount, a.paymentCount, a.productionCount, a.priceCount, a.producedWh, a.consumedWh, a.paidUsdc, unpaidN].join("|");
  const changed = lastSig !== "" && sig !== lastSig;
  lastSig = sig;

  const max = a.producedWh > a.consumedWh ? a.producedWh : a.consumedWh;
  const pct = (v: bigint) => (max === 0n ? 0 : Number((v * 10000n) / max) / 100);
  $("bar-prod").style.width = `${pct(a.producedWh)}%`;
  $("bar-cons").style.width = `${pct(a.consumedWh)}%`;

  const rows = $("rows");
  const cards = $("cards");
  rows.replaceChildren();
  cards.replaceChildren();
  if (a.readings.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "empty";
    td.textContent = "No consumption readings recorded on-chain yet. New readings appear here after the next refresh.";
    tr.append(td);
    rows.append(tr);
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = td.textContent;
    cards.append(li);
  } else {
    for (const r of [...a.readings].reverse()) {
      rows.append(renderRow(r));
      cards.append(renderCard(r));
    }
  }
  return changed;
}

// "status" is the single polite live region: errors and "Data updated" only.
function setStatus(kind: "" | "loading" | "error" | "updated", msg: string) {
  const el = $("status");
  const loading = $("loading");
  if (kind === "loading") {
    loading.hidden = false;
    loading.textContent = msg;
    el.className = "status";
    el.textContent = "";
  } else {
    loading.hidden = true;
    loading.textContent = "";
    el.className = kind === "updated" ? "status sr" : `status ${kind}`;
    el.textContent = msg;
  }
  $("dot").className = `dot ${kind === "loading" || kind === "error" ? kind : ""}`;
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
    const changed = render(d);
    loaded = true;
    setStatus(changed ? "updated" : "", changed ? "Data updated" : "");
  } catch (e: any) {
    setStatus("error", loaded ? `Refresh failed, showing the last data. ${e.message}` : e.message);
  } finally {
    busy = false;
    $<HTMLButtonElement>("refresh").disabled = false;
  }
}

const CORE = new Set(["Main", "Register", "EnergyOracle", "Escrow"]);
const addrLinks: [HTMLAnchorElement, string][] = [];

function addrLink(address: string): HTMLAnchorElement {
  const a = link(`${EXPLORER}/address/${address}`, addrText(address), "addr full");
  a.title = address;
  addrLinks.push([a, address]);
  return a;
}

function renderContracts() {
  const core = $("contracts");
  const minor = $("contracts-minor");
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
    li.append(name, role, addrLink(c.address), ver);
    (CORE.has(c.name) ? core : minor).append(li);
  }
  mq.addEventListener("change", () => {
    for (const [a, full] of addrLinks) a.textContent = addrText(full);
  });
}

function setupPriceTip() {
  const btn = $<HTMLButtonElement>("price-info");
  const tip = $("price-tip");
  let openedAt = 0;
  const set = (open: boolean) => {
    if (open && tip.hidden) openedAt = Date.now();
    tip.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
  };
  btn.addEventListener("click", () => {
    if (Date.now() - openedAt < 400) return; // hover/focus just opened it
    set(Boolean(tip.hidden));
  });
  btn.addEventListener("mouseenter", () => set(true));
  btn.addEventListener("mouseleave", () => { if (document.activeElement !== btn) set(false); });
  btn.addEventListener("focus", () => set(true));
  btn.addEventListener("blur", () => set(false));
  btn.addEventListener("keydown", (e) => { if (e.key === "Escape") set(false); });
}

renderContracts();
setupPriceTip();
$("refresh").addEventListener("click", load);
setInterval(() => {
  if (!document.hidden) load();
}, 30000);
load();
