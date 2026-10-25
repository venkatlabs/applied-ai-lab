import type { ResearchRun } from "./types";
import { distributionSummary } from "./scenario-math";

/**
 * Required-return view of the saved five-case model: the price at which its assumption-weighted
 * 12-month value would earn the hurdle. Pure arithmetic on the report's own assumptions; the weights are
 * assumptions, not validated probabilities, and nothing here changes the verdict.
 */
export const DEFAULT_HURDLE = 0.15;

export type HurdleView = {
  hurdle: number; expectedPrice: number; hurdlePrice: number;
  referencePrice: number; referenceDate: string; fromReport: boolean;
  expectedReturnPct: number; clears: boolean; gapPct: number;
};

export function hurdleView(run: ResearchRun | undefined, latest?: { price: number; date: string }, hurdle = DEFAULT_HURDLE): HurdleView | null {
  const cases = run?.scenarioDistribution?.cases;
  if (!run || !cases || cases.length !== 5 || !(hurdle > 0 && hurdle < 1)) return null;
  const reportDate = (run.marketAsOf ?? run.analyzedAt).slice(0, 10);
  const newer = latest && latest.price > 0 && latest.date.slice(0, 10) > reportDate;
  const referencePrice = newer ? latest!.price : run.asOfPrice;
  const summary = distributionSummary(cases, referencePrice);
  if (!summary || !(referencePrice > 0)) return null;
  const hurdlePrice = summary.price / (1 + hurdle);
  return {
    hurdle, expectedPrice: summary.price, hurdlePrice, referencePrice, referenceDate: newer ? latest!.date.slice(0, 10) : reportDate, fromReport: !newer,
    expectedReturnPct: Number(summary.returnPct.toFixed(1)), clears: summary.returnPct / 100 >= hurdle,
    gapPct: Number(((referencePrice / hurdlePrice - 1) * 100).toFixed(1)),
  };
}
