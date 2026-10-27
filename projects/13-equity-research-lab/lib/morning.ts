import type { Holdings } from "./holdings";
import type { ResearchRun } from "./types";
import { researchOutcome, type Outcome } from "./outcome";
import { sectorFor } from "./diversification";
import { sectorGroups } from "./peer-valuation";
import type { ScreenResult } from "./screen";

/**
 * Pure planning and summarising for the 7 a.m. preparation job. It decides what to research, then describes the
 * result in percentages only (no dollar amounts or share counts are ever stored in the brief).
 */
export const LIMIT = 0.10;          // single-stock planning limit (same default as the rest of the app)
export const COMFORT = 0.25;         // interim ceiling shown for very large positions
export const AI_INFRASTRUCTURE = ["NVDA", "AMD", "AVGO", "MU", "TSM", "NBIS", "CRWV", "PLTR", "INTC", "ARM", "MRVL", "ANET", "SMCI", "VRT", "ORCL", "SMH", "SOXX", "AIQ"] as const;

const pct = (x: number) => `${(x * 100).toFixed(x >= 0.1 ? 0 : 1)}%`;
const valid = (t: string) => /^[A-Z][A-Z.\-]{0,9}$/.test(t);

export type Concentrated = { symbol: string; weight: number; gainPct: number | null; pinned: boolean };
export function topConcentrated(h: Holdings, n = 3, pinned: string[] = []): Concentrated[] {
  const value = (s: string) => h.positions.filter(p => p.symbol === s).reduce((a, p) => a + p.shares * p.price, 0);
  const rows = h.positions.filter(p => p.kind === "stock" && p.shares > 0 && h.totalValue > 0).map(p => {
    const v = p.shares * p.price;
    return { symbol: p.symbol, weight: v / h.totalValue, gainPct: p.averageCost && p.averageCost > 0 ? Number(((p.price / p.averageCost - 1) * 100).toFixed(1)) : null, pinned: false };
  }).sort((a, b) => b.weight - a.weight);
  const pins = [...new Set(pinned.map(s => s.trim().toUpperCase()).filter(valid))].map(symbol => rows.find(r => r.symbol === symbol) ?? { symbol, weight: h.totalValue > 0 ? value(symbol) / h.totalValue : 0, gainPct: null, pinned: true });
  const out: Concentrated[] = pins.map(p => ({ ...p, pinned: true }));
  for (const r of rows) if (out.length < Math.max(n, pins.length) && !out.some(o => o.symbol === r.symbol)) out.push(r);
  return out.slice(0, Math.max(n, pins.length));
}

export type ClusterWeight = { name: string; weight: number; symbols: string[] };
export function clusterWeights(h: Holdings): ClusterWeight[] {
  const total = h.totalValue;
  if (!(total > 0)) return [];
  const held = h.positions.filter(p => (AI_INFRASTRUCTURE as readonly string[]).includes(p.symbol) && p.shares > 0);
  const weight = held.reduce((a, p) => a + (p.shares * p.price) / total, 0);
  return held.length ? [{ name: "AI infrastructure and semiconductors", weight, symbols: held.map(p => p.symbol).sort() }] : [];
}

/** Share of a position you would sell to bring it down to a target weight. */
export const sellFraction = (weight: number, target: number) => weight > target && weight > 0 ? 1 - target / weight : 0;

export function pickDiscovery(input: { dayIndex: number; exclude: Set<string>; count: number }): { symbol: string; sector: string }[] {
  const groups = sectorGroups(), out: { symbol: string; sector: string }[] = [];
  const taken = new Set(input.exclude);
  for (let k = 0; k < groups.length * 2 && out.length < input.count; k++) {
    const g = groups[(input.dayIndex + k) % groups.length];
    const pool = g.symbols.filter(s => !taken.has(s));
    if (!pool.length) continue;
    const symbol = pool[Math.floor(input.dayIndex / groups.length) % pool.length];
    taken.add(symbol); out.push({ symbol, sector: g.sector });
    // One new name per sector per day, so the search spreads across industries.
    for (const s of g.symbols) taken.add(s);
  }
  return out;
}
export const dayIndexOf = (day: string) => Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);

export type BriefItem = {
  symbol: string; role: "concentrated" | "discovery" | "exit-watch"; tier: "deep" | "light" | "reuse"; tierReason: string; screenLabel: ScreenResult["label"] | null; status: "pending" | "researched" | "reused" | "skipped" | "failed";
  reportId: string | null; verdict: Outcome["verdict"] | null; confidence: Outcome["confidence"]; score: number | null;
  previousVerdict: string | null; changed: boolean; weightPct: number | null; sector: string;
  lines: string[]; note?: string; costUSD: number | null; seconds: number | null;
};
export type Brief = {
  day: string; generatedAt: string; status: "complete" | "partial" | "skipped" | "failed"; summary: string;
  concentration: { top: { symbol: string; weightPct: number; sector: string; gainPct: number | null; sellToLimitPct: number }[]; top3Pct: number; top5Pct: number; clusters: { name: string; weightPct: number; symbols: string[] }[]; flags: string[] } | null;
  items: BriefItem[]; cost: { estimatedUSD: number | null; reports: number }; notes: string[];
};

export function describeItem(o: Outcome, weight: number | null, previous: string | null, sector: string, clusterPct: number | null, inAi: boolean): string[] {
  const lines = [`${o.verdict}${o.confidence ? ` (${o.confidence} confidence${o.score !== null ? `, score ${o.score}` : ""})` : ""}. ${weight !== null ? o.ownedAction : o.notOwnedAction}`];
  if (previous && previous !== o.verdict) lines.push(`Changed from ${previous}.`);
  if (weight !== null && weight > LIMIT) {
    const x = weight / LIMIT;
    lines.push(`Concentration: ${pct(weight)} of your portfolio, ${x.toFixed(1)}× the ${pct(LIMIT)} planning limit${weight > 2 * LIMIT ? "; consider reducing in stages whatever the verdict says" : ""}.`);
    lines.push(`Selling about ${pct(sellFraction(weight, LIMIT))} of the position would reach the limit${weight > COMFORT ? `; about ${pct(sellFraction(weight, COMFORT))} would reach an interim ${pct(COMFORT)}` : ""}. Taxes and lots are not included.`);
  }
  if (inAi && clusterPct !== null) lines.push(`It moves with your other AI-infrastructure names, together about ${pct(clusterPct)} of the portfolio.`);
  if (o.missing.length && o.confidence === "Low") lines.push(`Missing: ${o.missing.slice(0, 3).join("; ")}.`);
  void sector;
  return lines;
}

export function summariseBrief(items: BriefItem[], extra: string[] = []): { status: Brief["status"]; summary: string } {
  const pending = items.filter(i => i.status === "pending").length;
  const done = items.filter(i => i.status === "researched" || i.status === "reused");
  const failed = items.filter(i => i.status === "failed");
  const changed = done.filter(i => i.changed);
  const status: Brief["status"] = !items.length ? "skipped" : pending > 0 ? "partial" : done.length === 0 ? "failed" : failed.length || items.some(i => i.status === "skipped") ? "partial" : "complete";
  const bits = [`${done.length} of ${items.length} stocks ready${pending ? ` (${pending} still being prepared)` : ""}`, changed.length ? `${changed.length} verdict change${changed.length === 1 ? "" : "s"}: ${changed.map(c => c.symbol).join(", ")}` : "no verdict changes", ...extra];
  return { status, summary: bits.join(" · ") + "." };
}

export const latestReportBefore = (runs: ResearchRun[], symbol: string, beforeId?: string) =>
  runs.filter(r => r.ticker === symbol && r.dataMode !== "demo" && r.id !== beforeId).sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt))[0];
export { researchOutcome, sectorFor };

/**
 * Should a top holding get a new paid deep report today? A deep report is expensive, so it is refreshed when it is missing,
 * old, or the price has moved enough that its conclusions may be stale. Otherwise the latest report stands and the free
 * daily checks (prices, triggers, concentration) keep running.
 */
export function needsDeepRefresh(input: { report: ResearchRun | undefined; price: number | null; now: Date; maxAgeDays?: number; movePct?: number; always?: boolean }): { deep: boolean; reason: string } {
  const { report, price, now } = input, maxAge = input.maxAgeDays ?? 7, move = input.movePct ?? 7;
  if (input.always) return { deep: true, reason: "A deep report every morning is switched on." };
  if (!report) return { deep: true, reason: "No deep report exists yet." };
  const age = Math.floor((now.getTime() - Date.parse(report.analyzedAt)) / 86400000);
  if (!Number.isFinite(age) || age >= maxAge) return { deep: true, reason: `The latest deep report is ${Number.isFinite(age) ? age : "many"} days old (limit ${maxAge}).` };
  if (price && report.asOfPrice > 0) {
    const m = (price / report.asOfPrice - 1) * 100;
    if (Math.abs(m) >= move) return { deep: true, reason: `The price moved ${m > 0 ? "+" : ""}${m.toFixed(1)}% since the report (limit ${move}%).` };
    return { deep: false, reason: `Latest deep report is ${age} day${age === 1 ? "" : "s"} old and the price moved ${m > 0 ? "+" : ""}${m.toFixed(1)}% since; no new paid report needed.` };
  }
  return { deep: false, reason: `Latest deep report is ${age} day${age === 1 ? "" : "s"} old; no current price to compare, so it stands.` };
}

export function describeScreen(screen: ScreenResult, owned: boolean): string[] {
  const good = screen.signals.filter(x => x.score > 0).map(x => x.label.toLowerCase()), bad = screen.signals.filter(x => x.score < 0).map(x => x.label.toLowerCase());
  const lines = [`Quick screen: ${screen.label}. No AI used, so this is not a verdict.${good.length ? ` Positives: ${good.join(", ")}.` : ""}${bad.length ? ` Concerns: ${bad.join(", ")}.` : ""}`];
  if (owned && screen.label === "Skip for now") lines.push("This holding screens weak. Worth a paid deep look to decide whether to exit.");
  if (!owned && screen.label === "Worth a deep look") lines.push("Promising on the screen. Run a deep report before acting.");
  if (screen.missing.length) lines.push(`Not available: ${screen.missing.join("; ")}.`);
  return lines;
}

/** Owned stocks outside the top holdings, rotated so each is screened in turn. */
export function exitWatchCandidates(h: Holdings, exclude: Set<string>, dayIndex: number, count: number): string[] {
  const ranked = h.positions.filter(p => p.kind === "stock" && p.shares > 0 && !exclude.has(p.symbol)).sort((a, b) => b.shares * b.price - a.shares * a.price).map(p => p.symbol);
  if (!ranked.length || count <= 0) return [];
  const start = dayIndex % ranked.length;
  return Array.from({ length: Math.min(count, ranked.length) }, (_, k) => ranked[(start + k) % ranked.length]);
}
