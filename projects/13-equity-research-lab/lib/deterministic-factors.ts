import type { InvestmentCase } from "./investment";

type Rating = "Very weak" | "Weak" | "Mixed" | "Strong" | "Very strong";
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const money = (x: number) => `$${(Math.abs(x) / 1e9).toFixed(2)}B`;

/**
 * Profit, cash and funding rated from the latest annual filing. The same filing and prices always give the
 * same rating, so this factor cannot flip between runs the way a model-written rating can.
 */
export function cashRating(f: { revenue?: number; netIncome?: number; freeCashFlow?: number; cash?: number; debt?: number }): { rating: Rating; reason: string } | undefined {
  if (!finite(f.revenue) || f.revenue <= 0 || !finite(f.netIncome) || !finite(f.freeCashFlow)) return undefined;
  const margin = f.freeCashFlow / f.revenue, profitable = f.netIncome > 0;
  const haveBalance = finite(f.cash) && finite(f.debt);
  const heavyDebt = haveBalance && f.debt! > 3 * Math.max(f.cash!, 0);
  const balance = haveBalance ? ` Cash ${money(f.cash!)} against debt ${money(f.debt!)}.` : " Cash and debt were not both reported.";
  const head = `${profitable ? "Profitable" : "Loss-making"} (net income ${profitable ? "" : "−"}${money(f.netIncome)}) with free cash flow of ${f.freeCashFlow < 0 ? "−" : ""}${money(f.freeCashFlow)} (${pct(margin)} of revenue).`;
  if (profitable && f.freeCashFlow > 0) {
    if (margin >= 0.15 && (!haveBalance || f.cash! >= f.debt!)) return { rating: "Very strong", reason: `${head}${balance}` };
    if (margin >= 0.05) return { rating: "Strong", reason: `${head}${balance}` };
    return { rating: "Mixed", reason: `${head} Cash generation is thin relative to revenue.${balance}` };
  }
  if (profitable) return { rating: heavyDebt ? "Weak" : "Mixed", reason: `${head} Earnings are not turning into free cash, often heavy investment.${balance}` };
  if (f.freeCashFlow > 0) return { rating: "Mixed", reason: `${head} Cash positive despite accounting losses.${balance}` };
  const burn = Math.abs(f.freeCashFlow);
  const runway = haveBalance && burn > 0 ? Math.max(f.cash!, 0) / burn : undefined;
  if (heavyDebt || (runway != null && runway < 1)) return { rating: "Very weak", reason: `${head}${runway != null ? ` Cash covers about ${runway.toFixed(1)} years of this burn.` : ""}${balance}` };
  return { rating: "Weak", reason: `${head}${runway != null ? ` Cash covers about ${runway.toFixed(1)} years of this burn.` : " The funding runway cannot be measured from the reported figures."}${balance}` };
}

/** Growth potential rated from the consensus revenue growth rate; the thresholds match the free quick screen. */
export function growthRating(growth: number | undefined): { rating: Rating; reason: string } | undefined {
  if (!finite(growth)) return undefined;
  const rating: Rating = growth >= 0.2 ? "Very strong" : growth >= 0.1 ? "Strong" : growth >= 0.03 ? "Mixed" : growth >= 0 ? "Weak" : "Very weak";
  return { rating, reason: `Consensus revenue growth of about ${pct(growth)} a year.` };
}

/**
 * Sets the cash and growth factors in code and keeps the model's own view visible but unused.
 * Skipped, leaving the model's factor untouched, when the figures or a citable source are missing or stale.
 */
export function applyDeterministicFactors(
  thesis: InvestmentCase,
  ctx: { asOf: string; secUrl?: string; annualEnd?: string; fundamentals?: Parameters<typeof cashRating>[0]; consensusUrl?: string; consensusGrowth?: number },
): InvestmentCase {
  const out: InvestmentCase = { ...thesis, factors: { ...thesis.factors } };
  const note = (model: InvestmentCase["factors"]["cash"], detail: string, rating: Rating) =>
    `${detail}${model.rating !== rating && model.rating !== "Unknown" ? ` The model rated this ${model.rating}; the rating used is set in code.` : ""}${model.reason.trim() ? ` Model critique: ${model.reason.trim()}` : ""}`;
  const annualAge = ctx.annualEnd ? (Date.parse(ctx.asOf) - Date.parse(ctx.annualEnd)) / 86400000 : NaN;

  const cash = cashRating(ctx.fundamentals ?? {});
  if (cash && ctx.secUrl && Number.isFinite(annualAge) && annualAge >= 0 && annualAge <= 460 && ctx.annualEnd) {
    const m = thesis.factors.cash;
    out.factors.cash = { rating: cash.rating, reason: note(m, cash.reason, cash.rating), sources: [ctx.secUrl, ...m.sources.filter(u => u !== ctx.secUrl)].slice(0, 5), evidenceDate: ctx.annualEnd };
  }
  const growth = growthRating(ctx.consensusGrowth);
  if (growth && ctx.consensusUrl) {
    const m = thesis.factors.growth;
    out.factors.growth = { rating: growth.rating, reason: note(m, growth.reason, growth.rating), sources: [ctx.consensusUrl, ...m.sources.filter(u => u !== ctx.consensusUrl)].slice(0, 5), evidenceDate: ctx.asOf };
  }
  return out;
}
