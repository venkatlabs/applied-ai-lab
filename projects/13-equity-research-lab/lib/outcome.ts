import type { ResearchRun } from "./types";
import { factorKeys, factorLabels, factorPoints, factorWeights } from "./investment";
import { distributionSummary } from "./scenario-math";

/**
 * One clear research outcome per report: a verdict, a confidence and the reasons, computed in code from the
 * existing six factors. Missing evidence lowers confidence and is listed; it never produces "no answer".
 * Thresholds are policy choices, not calibrated probabilities. This is research output, not personal advice.
 */
export const verdicts = ["Buy / Add", "Hold", "Trim", "Sell / Avoid", "Not researched"] as const;
export type Verdict = (typeof verdicts)[number];
export type Confidence = "High" | "Medium" | "Low";
export const OUTCOME_THRESHOLDS = { buy: 70, trim: 40, sell: 30 } as const;
const REFRESH_AFTER_DAYS = 30;
const dayMs = 86400000;

export type Outcome = {
  verdict: Verdict;
  lean: "positive" | "neutral" | "negative" | null;
  score: number | null;
  confidence: Confidence | null;
  confidencePoints: number | null;
  method: "six-factor" | "legacy" | "none";
  headline: string;
  ownedAction: string;
  notOwnedAction: string;
  reasonsFor: string[];
  reasonsAgainst: string[];
  changeMind: string;
  missing: string[];
  analyzedAt: string | null;
  ageDays: number | null;
  needsRefresh: boolean;
  weightedReturnPct: number | null;
  bearPrice: number | null;
  bullPrice: number | null;
};

const shorten = (s: string, n = 180) => s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
const empty = (headline: string, missing: string[]): Outcome => ({
  verdict: "Not researched", lean: null, score: null, confidence: null, confidencePoints: null, method: "none", headline,
  ownedAction: "Research this stock before deciding.", notOwnedAction: "Research this stock before deciding.",
  reasonsFor: [], reasonsAgainst: [], changeMind: "", missing, analyzedAt: null, ageDays: null, needsRefresh: true,
  weightedReturnPct: null, bearPrice: null, bullPrice: null,
});

export function verdictForScore(score: number): { verdict: Verdict; lean: "positive" | "neutral" | "negative" } {
  if (score >= OUTCOME_THRESHOLDS.buy) return { verdict: "Buy / Add", lean: "positive" };
  if (score >= OUTCOME_THRESHOLDS.trim) return { verdict: "Hold", lean: score >= 60 ? "positive" : score < 50 ? "negative" : "neutral" };
  if (score >= OUTCOME_THRESHOLDS.sell) return { verdict: "Trim", lean: "negative" };
  return { verdict: "Sell / Avoid", lean: "negative" };
}

const actions: Record<Verdict, { owned: string; notOwned: string }> = {
  "Buy / Add": { owned: "Keep it and consider adding within your risk limit.", notOwned: "A buy candidate: consider starting a position within your risk limit." },
  Hold: { owned: "Keep your position; no strong reason to add or sell.", notOwned: "Wait: the case is not strong enough to buy now." },
  Trim: { owned: "Consider reducing the position; the recorded risks outweigh the strengths.", notOwned: "Do not buy now." },
  "Sell / Avoid": { owned: "Review selling: the evidence is clearly negative.", notOwned: "Avoid." },
  "Not researched": { owned: "Research this stock before deciding.", notOwned: "Research this stock before deciding." },
};

export function researchOutcome(run: ResearchRun | undefined | null, now = new Date()): Outcome {
  if (!run) return empty("No research has been run for this stock yet.", ["A research report"]);
  if (run.dataMode === "demo") return empty("This is demo data, not a real report.", ["A live research report"]);
  const analyzed = Date.parse(run.analyzedAt);
  const ageDays = Number.isFinite(analyzed) ? Math.max(0, Math.floor((now.getTime() - analyzed) / dayMs)) : null;
  const needsRefresh = ageDays === null || ageDays > REFRESH_AFTER_DAYS;
  const priceAge = (analyzed - Date.parse(run.marketAsOf ?? "")) / dayMs;
  const priceFresh = Number.isFinite(priceAge) && priceAge >= 0 && priceAge <= 7 && run.asOfPrice > 0;

  const summary = run.scenarioDistribution?.cases.length === 5 ? distributionSummary(run.scenarioDistribution.cases, run.asOfPrice) : null;
  const range = {
    weightedReturnPct: summary ? Number(summary.returnPct.toFixed(1)) : null,
    bearPrice: summary ? run.scenarioDistribution!.cases[0].price : null,
    bullPrice: summary ? run.scenarioDistribution!.cases[4].price : null,
  };

  const thesis = run.investmentCase;
  if (!thesis) {
    // Older reports: map their own saved score with low confidence instead of hiding them.
    const legacy = Number.isFinite(run.score) && run.score > 0 ? Math.round(run.score) : null;
    if (legacy === null) return { ...empty("This older report has no rating. Run fresh research for a clear outcome.", ["A report using the current method"]), analyzedAt: run.analyzedAt, ageDays, needsRefresh: true };
    const { verdict, lean } = verdictForScore(legacy);
    return {
      verdict, lean, score: legacy, confidence: "Low", confidencePoints: 25, method: "legacy",
      headline: `Older-method view: ${verdict.toLowerCase()}. Low confidence; rerun for the current method.`,
      ownedAction: actions[verdict].owned, notOwnedAction: actions[verdict].notOwned,
      reasonsFor: run.highlights.slice(0, 2).map(h => shorten(h)), reasonsAgainst: run.risks.slice(0, 2).map(r => shorten(r)),
      changeMind: run.thesisKillers[0] ? shorten(run.thesisKillers[0]) : "", missing: ["A report using the current six-factor method"],
      analyzedAt: run.analyzedAt, ageDays, needsRefresh, ...range,
    };
  }

  const known = factorKeys.filter(k => thesis.factors[k].rating !== "Unknown");
  const valuationKnown = known.includes("valuation");
  let score = Math.round(factorKeys.reduce((sum, k) => sum + factorWeights[k] * factorPoints[thesis.factors[k].rating], 0));
  if (!valuationKnown) score = Math.min(59, score);
  const { verdict, lean } = verdictForScore(score);
  // Cannot recommend buying without a recent verified price.
  const final: Verdict = verdict === "Buy / Add" && !priceFresh ? "Hold" : verdict;

  const fresh = (k: (typeof factorKeys)[number]) => {
    const f = thesis.factors[k]; if (f.rating === "Unknown" || !f.sources.length) return 0;
    const age = (analyzed - Date.parse(f.evidenceDate)) / dayMs;
    return Number.isFinite(age) && age >= 0 && age <= (k === "market" || k === "valuation" ? 120 : 460) ? 1 : 0;
  };
  const confidencePoints = Math.round(100 * (.4 * known.length / factorKeys.length + .25 * factorKeys.reduce((n, k) => n + fresh(k), 0) / factorKeys.length + .2 * (priceFresh ? 1 : 0) + .15 * (valuationKnown ? 1 : 0)));
  const confidence: Confidence = confidencePoints >= 75 ? "High" : confidencePoints >= 50 ? "Medium" : "Low";

  const impact = factorKeys.filter(k => thesis.factors[k].rating !== "Unknown").map(k => ({ k, d: factorWeights[k] * (factorPoints[thesis.factors[k].rating] - 50) }));
  const text = (k: (typeof factorKeys)[number]) => `${factorLabels[k]}: ${shorten(thesis.factors[k].reason)}`;
  const reasonsFor = impact.filter(x => x.d > 0).sort((a, b) => b.d - a.d).slice(0, 3).map(x => text(x.k));
  const reasonsAgainst = impact.filter(x => x.d < 0).sort((a, b) => a.d - b.d).slice(0, 3).map(x => text(x.k));

  const missing = factorKeys.filter(k => !known.includes(k)).map(k => `${factorLabels[k]} evidence`);
  if (!priceFresh) missing.push("a recent verified share price");
  if (verdict === "Buy / Add" && final === "Hold") missing.push("a recent price is needed before a buy view");
  const leanWord = lean === "positive" ? "leaning positive" : lean === "negative" ? "leaning negative" : "balanced";
  const headline = final === "Hold"
    ? `Hold, ${leanWord}. ${confidence} confidence${valuationKnown ? "" : "; the price cannot be judged without valuation evidence"}.`
    : `${final}. ${confidence} confidence.`;
  return {
    verdict: final, lean: final === "Hold" ? lean : verdict === "Buy / Add" ? "positive" : "negative", score, confidence, confidencePoints, method: "six-factor", headline,
    ownedAction: actions[final].owned, notOwnedAction: actions[final].notOwned, reasonsFor, reasonsAgainst,
    changeMind: shorten(thesis.changeMind, 260), missing, analyzedAt: run.analyzedAt, ageDays, needsRefresh, ...range,
  };
}

/** Latest report per ticker. */
export function latestByTicker(runs: ResearchRun[]): Map<string, ResearchRun> {
  const out = new Map<string, ResearchRun>();
  for (const r of runs) if (r.dataMode !== "demo" && (!out.has(r.ticker) || out.get(r.ticker)!.analyzedAt < r.analyzedAt)) out.set(r.ticker, r);
  return out;
}
