import { researchOutcome } from "./outcome";
import type { ResearchRun } from "./types";

// Zero-cost retrospective: grades each frozen report against the verified price in a
// LATER frozen report of the same ticker. No new API calls and no future information
// enters the original report. Price return only (no dividends, no benchmark), so this is
// an audit trail, not a statistically calibrated track record.

export const HORIZONS = [30, 90, 180, 365] as const;
const DAY = 86400000;

export type Outcome = {
  ticker: string; reportId: string; analyzedAt: string; action: string; score: number | null;
  horizon: number; laterId: string; laterAt: string; days: number; priceReturnPct: number;
  intrinsicBase?: number; movedTowardIntrinsic?: boolean;
  verdictCorrect: boolean | null;
};

const directional = (action: string) => action === "Buy / Add" ? 1 : action === "Trim" || action === "Sell / Avoid" ? -1 : 0;

export function outcomes(runs: ResearchRun[]): Outcome[] {
  const byTicker = new Map<string, ResearchRun[]>();
  for (const r of runs) if (r.dataMode !== "demo" && r.asOfPrice > 0) byTicker.set(r.ticker, [...(byTicker.get(r.ticker) ?? []), r]);
  const out: Outcome[] = [];
  for (const [ticker, list] of byTicker) {
    const sorted = [...list].sort((a, b) => a.analyzedAt.localeCompare(b.analyzedAt));
    for (const [i, early] of sorted.entries()) {
      const decision = researchOutcome(early, new Date(early.analyzedAt)); const call = decision.verdict;
      const t0 = Date.parse(early.marketAsOf ?? early.analyzedAt);
      for (const horizon of HORIZONS) {
        // Closest later report within ±25% of the horizon.
        const candidates = sorted.slice(i + 1).map(l => ({ l, days: (Date.parse(l.marketAsOf ?? l.analyzedAt) - t0) / DAY }))
          .filter(x => x.days >= horizon * 0.75 && x.days <= horizon * 1.25)
          .sort((a, b) => Math.abs(a.days - horizon) - Math.abs(b.days - horizon));
        const hit = candidates[0];
        if (!hit) continue;
        const ret = (hit.l.asOfPrice / early.asOfPrice - 1) * 100;
        const dir = directional(call);
        const iv = early.intrinsicValuation?.available ? early.intrinsicValuation.perShare.base : undefined;
        out.push({
          ticker, reportId: early.id, analyzedAt: early.analyzedAt, action: call, score: decision.score,
          horizon, laterId: hit.l.id, laterAt: hit.l.analyzedAt, days: Math.round(hit.days), priceReturnPct: Number(ret.toFixed(2)),
          intrinsicBase: iv,
          movedTowardIntrinsic: iv === undefined ? undefined : Math.abs(hit.l.asOfPrice - iv) < Math.abs(early.asOfPrice - iv),
          verdictCorrect: dir === 0 ? null : dir * ret > 0,
        });
      }
    }
  }
  return out.sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt) || a.horizon - b.horizon);
}

export function summary(list: Outcome[]) {
  return HORIZONS.map(horizon => {
    const rows = list.filter(o => o.horizon === horizon);
    const graded = rows.filter(o => o.verdictCorrect !== null);
    const iv = rows.filter(o => o.movedTowardIntrinsic !== undefined);
    return {
      horizon, measured: rows.length, graded: graded.length,
      hitRate: graded.length ? graded.filter(o => o.verdictCorrect).length / graded.length : null,
      towardIntrinsicRate: iv.length ? iv.filter(o => o.movedTowardIntrinsic).length / iv.length : null,
    };
  });
}
