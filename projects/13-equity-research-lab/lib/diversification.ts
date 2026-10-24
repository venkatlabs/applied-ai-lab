import type { Holdings } from "./holdings";
import { peerGroup } from "./peer-valuation";
import { screenUniverse } from "./opportunities";

// Deterministic concentration analysis for a private holdings snapshot. Funds/ETFs are
// not decomposed into underlying holdings; cash is
// its own bucket. Thresholds are transparent policy defaults, editable in the UI.

export const DEFAULT_LIMITS = { singleStock: 0.10, sector: 0.30 };

export type Diversification = {
  totalValue: number;
  invested: number;
  cashWeight: number;
  fundWeight: number;
  stockWeight: number;
  positions: { symbol: string; kind: "stock" | "fund"; value: number; weight: number; sector: string; overLimit: boolean; trimToLimit: number }[];
  largest?: { symbol: string; weight: number };
  top5Weight: number;
  effectiveHoldings: number | null;
  sectors: { sector: string; weight: number; overLimit: boolean }[];
  unknownSectorWeight: number;
  flags: string[];
  verdict: "Direct stock limits met" | "Exposure incomplete" | "Moderately concentrated" | "Highly concentrated" | "No stock positions";
};

// Names the peer groups do not cover but that matter for concentration.
const EXTRA_SECTORS: Record<string, string> = { NBIS: "AI cloud infrastructure", CRWV: "AI cloud infrastructure", PLTR: "Software platforms", MU: "Semiconductors", TSM: "Semiconductors", INTC: "Semiconductors", MRVL: "Semiconductors", ARM: "Semiconductors", SMCI: "AI cloud infrastructure", RKLB: "Aerospace and defense", TSLA: "Autos and EVs" };
export function sectorFor(symbol: string): string {
  return peerGroup(symbol)?.sector ?? screenUniverse.find(s => s.symbol === symbol)?.sector ?? EXTRA_SECTORS[symbol] ?? "Unknown";
}

export function diversification(h: Holdings, limits = DEFAULT_LIMITS): Diversification {
  const total = h.totalValue;
  const rows = h.positions.map(p => ({ symbol: p.symbol, kind: p.kind, value: p.shares * p.price }));
  const invested = rows.reduce((a, r) => a + r.value, 0);
  const w = (v: number) => (total > 0 ? v / total : 0);
  const positions = rows.map(r => {
    const weight = w(r.value), stock = r.kind === "stock";
    const overLimit = stock && weight > limits.singleStock;
    return { ...r, weight, sector: stock ? sectorFor(r.symbol) : "Funds / ETFs", overLimit, trimToLimit: overLimit ? r.value - limits.singleStock * total : 0 };
  }).sort((a, b) => b.value - a.value);
  const stocks = positions.filter(p => p.kind === "stock" && p.value > 0);
  const stockWeight = stocks.reduce((a, p) => a + p.weight, 0);
  const fundWeight = positions.filter(p => p.kind === "fund").reduce((a, p) => a + p.weight, 0);
  const hhi = stocks.reduce((a, p) => a + p.weight * p.weight, 0);
  const effectiveHoldings = hhi > 0 ? Number((stockWeight * stockWeight / hhi).toFixed(1)) : null;
  const top5Weight = stocks.slice(0, 5).reduce((a, p) => a + p.weight, 0);

  const bySector = new Map<string, number>();
  for (const p of stocks) bySector.set(p.sector, (bySector.get(p.sector) ?? 0) + p.weight);
  const unknownSectorWeight = bySector.get("Unknown") ?? 0;
  const sectors = [...bySector.entries()].filter(([s]) => s !== "Unknown")
    .map(([sector, weight]) => ({ sector, weight, overLimit: weight > limits.sector })).sort((a, b) => b.weight - a.weight);

  const flags: string[] = [];
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  for (const p of stocks.filter(p => p.overLimit)) flags.push(`${p.symbol} is ${pct(p.weight)} of the portfolio, above the ${pct(limits.singleStock)} single-stock limit. Trimming about $${Math.round(p.trimToLimit).toLocaleString("en-US")} would bring it to the limit (before taxes).`);
  for (const s of sectors.filter(s => s.overLimit)) flags.push(`${s.sector} stocks are ${pct(s.weight)} of the portfolio, above the ${pct(limits.sector)} sector limit.`);
  if (unknownSectorWeight > 0.05) flags.push(`Sector is unknown for ${pct(unknownSectorWeight)} of the portfolio; sector limits cannot be checked for those names.`);
  if (fundWeight > 0) flags.push("Fund underlying holdings, leverage and overlap with your direct stocks have not been assessed. Funds may be concentrated.");
  if (h.coverage === "partial") flags.push("This snapshot covers selected holdings only; exposure held elsewhere is not included.");

  const largest = stocks[0] ? { symbol: stocks[0].symbol, weight: stocks[0].weight } : undefined;
  const incomplete=h.coverage==='partial'||fundWeight>0||unknownSectorWeight>0;
  const verdict: Diversification["verdict"] = !stocks.length ? incomplete ? "Exposure incomplete" : "No stock positions"
    : (largest!.weight > 2 * limits.singleStock || (effectiveHoldings !== null && effectiveHoldings < 5 && stockWeight > 0.5)) ? "Highly concentrated"
    : (largest!.weight > limits.singleStock || sectors.some(s => s.overLimit)) ? "Moderately concentrated"
    : incomplete ? "Exposure incomplete" : "Direct stock limits met";

  return { totalValue: total, invested, cashWeight: w(h.cashAvailable), fundWeight, stockWeight, positions, largest, top5Weight, effectiveHoldings, sectors, unknownSectorWeight, flags, verdict };
}

/** How a proposed add changes the candidate's weight versus the single-stock limit. */
export function portfolioFit(h: Holdings, symbol: string, addAmount: number, limits = DEFAULT_LIMITS) {
  const current = h.positions.find(p => p.symbol === symbol);
  const before = current ? current.shares * current.price : 0;
  const weightBefore = h.totalValue > 0 ? before / h.totalValue : 0;
  const weightAfter = h.totalValue > 0 ? (before + addAmount) / h.totalValue : 0;
  const room = Math.max(0, limits.singleStock * h.totalValue - before);
  return { weightBefore, weightAfter, room, exceeds: weightAfter > limits.singleStock, sector: sectorFor(symbol) };
}
