import type { ResearchRun } from "./types";
import { researchOutcome, latestByTicker, type Outcome } from "./outcome";
import { hurdleView, type HurdleView } from "./hurdle";

/** Pure model behind the "My stocks" home: one row per stock you own, follow or have researched. */
export type StockRow = {
  symbol: string; companyName: string; owned: boolean; following: boolean;
  outcome: Outcome; report?: ResearchRun; reportCount: number;
  sinceCall: { movePct: number; days: number; right: boolean | null } | null;
  hurdle: HurdleView | null;
  priority: number; action: "Research" | "Refresh" | "Open";
};
export type Price = { price: number; date: string };

const dayMs = 86400000;
const valid = (t: string) => /^[A-Z][A-Z.\-]{0,9}$/.test(t);

/** How the call has done since it was made, using a later known price. Not a forecast of anything. */
export function sinceCall(run: ResearchRun | undefined, outcome: Outcome, latest: Price | undefined) {
  if (!run || !latest || !(latest.price > 0) || !(run.asOfPrice > 0) || outcome.verdict === "Not researched") return null;
  const days = Math.round((Date.parse(latest.date.slice(0, 10)) - Date.parse((run.marketAsOf ?? run.analyzedAt).slice(0, 10))) / dayMs);
  if (!Number.isFinite(days) || days < 7) return null;
  const movePct = Number(((latest.price / run.asOfPrice - 1) * 100).toFixed(1));
  const right = outcome.verdict === "Buy / Add" ? movePct > 0 : outcome.verdict === "Trim" || outcome.verdict === "Sell / Avoid" ? movePct < 0 : Math.abs(movePct) <= 10;
  return { movePct, days, right };
}

function priority(owned: boolean, following: boolean, o: Outcome): number {
  if (o.verdict === "Not researched") return owned ? 0 : following ? 5 : 6;
  if (owned && (o.verdict === "Sell / Avoid" || o.verdict === "Trim")) return 1;
  if (owned && o.needsRefresh) return 2;
  if (o.verdict === "Buy / Add") return 3;
  return owned ? 4 : 6;
}

export function buildStockRows(input: { owned: string[]; following: string[]; runs: ResearchRun[]; prices?: Record<string, Price>; now?: Date }): StockRow[] {
  const now = input.now ?? new Date();
  const latest = latestByTicker(input.runs);
  const counts = new Map<string, number>();
  for (const r of input.runs) if (r.dataMode !== "demo") counts.set(r.ticker, (counts.get(r.ticker) ?? 0) + 1);
  const owned = new Set(input.owned.map(s => s.toUpperCase()).filter(valid));
  const following = new Set(input.following.map(s => s.toUpperCase()).filter(valid));
  const symbols = new Set([...owned, ...following, ...latest.keys()]);
  const rows = [...symbols].map((symbol): StockRow => {
    const report = latest.get(symbol), outcome = researchOutcome(report, now);
    const isOwned = owned.has(symbol), isFollowing = following.has(symbol);
    return {
      symbol, companyName: report?.companyName ?? symbol, owned: isOwned, following: isFollowing, outcome, report, reportCount: counts.get(symbol) ?? 0,
      sinceCall: sinceCall(report, outcome, input.prices?.[symbol]), hurdle: hurdleView(report, input.prices?.[symbol]), priority: priority(isOwned, isFollowing, outcome),
      action: !report || outcome.verdict === "Not researched" ? "Research" : outcome.needsRefresh ? "Refresh" : "Open",
    };
  });
  return rows.sort((a, b) => a.priority - b.priority || Number(b.owned) - Number(a.owned) || a.symbol.localeCompare(b.symbol));
}

export function summarize(rows: StockRow[]) {
  const researched = rows.filter(r => r.outcome.verdict !== "Not researched");
  return {
    total: rows.length, researched: researched.length,
    needResearch: rows.filter(r => r.owned && r.action === "Research").length,
    needRefresh: rows.filter(r => r.owned && r.action === "Refresh").length,
    buy: rows.filter(r => r.outcome.verdict === "Buy / Add").length,
    reduce: rows.filter(r => r.owned && (r.outcome.verdict === "Trim" || r.outcome.verdict === "Sell / Avoid")).length,
  };
}

/** Owned stocks (not funds) that have no usable report, capped so one click cannot overspend. */
export function researchQueue(rows: StockRow[], remaining: number, max = 10): string[] {
  const want = rows.filter(r => r.owned && r.action === "Research").map(r => r.symbol);
  return want.slice(0, Math.max(0, Math.min(max, remaining)));
}
