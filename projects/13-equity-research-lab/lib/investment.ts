import { z } from "zod";
import type { ResearchRun } from "./types";
export const factorKeys = ["growth", "cash", "valuation", "competition", "execution", "market"] as const;
export const factorLabels = { growth: "Growth potential", cash: "Profit, cash and funding", valuation: "What the price already assumes", competition: "Customers and competitive position", execution: "Execution, governance and dilution", market: "Market, rates and external risks" };
export const factorRatings = ["Very weak", "Weak", "Mixed", "Strong", "Very strong", "Unknown"] as const;
const factorSchema = z.object({ rating: z.enum(factorRatings), reason: z.string(), sources: z.array(z.string()).max(5), evidenceDate: z.string() });
export const investmentCaseSchema = z.object({
  factors: z.object(Object.fromEntries(factorKeys.map(k => [k, factorSchema])) as Record<typeof factorKeys[number], typeof factorSchema>),
  valuationBasis: z.enum(["Peer comparison", "Independent cash-flow valuation", "Unavailable"]),
  valuationBenchmark: z.string(),
  growthOutlook: z.string(), strongestCounterargument: z.string(), timing: z.string(), changeMind: z.string(),
});
export type InvestmentCase = z.infer<typeof investmentCaseSchema>;
export const investmentCaseJsonSchema = {
  type: "object", additionalProperties: false, required: ["valuationBasis", "valuationBenchmark", "factors", "growthOutlook", "strongestCounterargument", "timing", "changeMind"],
  properties: {
    valuationBasis: { type: "string", enum: ["Peer comparison", "Independent cash-flow valuation", "Unavailable"] },
    valuationBenchmark: { type: "string" },
    factors: { type: "object", additionalProperties: false, required: [...factorKeys], properties: Object.fromEntries(factorKeys.map(k => [k, {
      type: "object", additionalProperties: false, required: ["rating", "reason", "sources", "evidenceDate"], properties: {
        rating: { type: "string", enum: [...factorRatings] }, reason: { type: "string" }, sources: { type: "array", maxItems: 5, items: { type: "string" } }, evidenceDate: { type: "string" },
      },
    }])) },
    ...Object.fromEntries(["growthOutlook", "strongestCounterargument", "timing", "changeMind"].map(k => [k, { type: "string" }])),
  },
};
// Fixed policy weights. These are transparent research judgments, not calibrated return probabilities.
export const factorWeights = { growth: .2, cash: .2, valuation: .25, competition: .15, execution: .1, market: .1 };
export const factorPoints = { "Very weak": 10, Weak: 30, Mixed: 50, Strong: 70, "Very strong": 90, Unknown: 50 };
export function validateInvestmentCase(value: InvestmentCase, urls: string[], asOf: string): InvestmentCase {
  const result = investmentCaseSchema.parse(value);
  const allowed = new Set(urls);
  for (const key of factorKeys) {
    const factor = result.factors[key];
    factor.sources = factor.sources.filter(url => allowed.has(url));
    const age = (Date.parse(asOf) - Date.parse(factor.evidenceDate)) / 86400000;
    // A valid citation establishes provenance, not factual correctness. The cited reasoning remains reviewable.
    if (!factor.sources.length || !/^\d{4}-\d{2}-\d{2}$/.test(factor.evidenceDate) || !Number.isFinite(age) || (Number.isFinite(age) && new Date(factor.evidenceDate).toISOString().slice(0,10) !== factor.evidenceDate) || age < 0 || age > (key === "market" || key === "valuation" ? 120 : 460)) {
      if (factor.rating !== "Unknown") factor.reason += " Evidence is missing, undated, stale or not linked to a retrieved source.";
      factor.rating = "Unknown";
    }
  }
  if (result.valuationBasis === "Unavailable" || !result.valuationBenchmark.trim()) {
    result.factors.valuation.rating = "Unknown";
  }
  return result;
}
export function singleInvestmentDecision(run: ResearchRun) {
  const thesis = run.investmentCase;
  const known = thesis ? factorKeys.filter(k => thesis.factors[k].rating !== "Unknown") : [];
  const priceAge = (Date.parse(run.analyzedAt) - Date.parse(run.marketAsOf ?? "")) / 86400000;
  const missing = thesis ? factorKeys.filter(k => !known.includes(k)).map(k => factorLabels[k]) : ["a fresh report using the unified investment method"];
  const available = run.dataMode !== "demo" && !!thesis && known.length >= 4 && known.includes("growth") && known.includes("cash") && run.asOfPrice > 0 && Number.isFinite(priceAge) && priceAge >= 0 && priceAge <= 7;
  if (!Number.isFinite(priceAge) || priceAge < 0 || priceAge > 7 || !(run.asOfPrice > 0)) missing.push("a recent verified share price");
  let score: number | null = available ? Math.round(factorKeys.reduce((sum,k) => sum + factorWeights[k] * factorPoints[thesis!.factors[k].rating], 0)) : null;
  // Unknown valuation blocks a buy. A sell still requires negative evidence in other factors.
  if (score !== null && !known.includes("valuation")) score = Math.min(59, score);
  const action = score === null ? thesis ? "Research incomplete" : "Older report · rerun" : score >= 70 ? "Buy candidate" : !known.includes("valuation") && score >= 40 ? "Valuation incomplete · wait before adding" : score >= 60 ? "Watch for a better entry" : score >= 40 ? "Hold / wait" : "Avoid / review selling";
  const ownedAction = score === null ? "Review the missing evidence before changing your position" : score >= 70 ? "Hold; consider adding within your risk limit" : score >= 40 ? "Hold only while the thesis remains intact; review your exposure" : "Review trimming or selling: the recorded risks outweigh the strengths";
  const reason = score === null ? "The evidence does not yet support a directional investment rating. This is not a sell signal." : score < 40 ? thesis!.timing : !known.includes("valuation") ? "The business may have potential, but the evidence does not establish whether today's price offers value. Wait before adding." : thesis!.timing;
  return { available, score, action, ownedAction, reason, missing, instrument: "Shares avoid an expiration deadline. Options require a separate check of timing, premium, volatility and maximum loss; the stock score alone cannot select a contract." };
}
