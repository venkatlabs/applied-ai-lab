/**
 * Historical range of 12-month outcomes from a stock's own monthly returns (bootstrap: months are drawn at random,
 * with replacement, from its past). It describes how this stock has behaved, not what will happen: it ignores the
 * business, valuation and regime changes, and a stock that did well in the past makes the "as it happened" version
 * look optimistic. The zero-drift version keeps only the size of past swings, so it shows how much a hurdle depends on luck.
 * Pure and seeded: the same history and seed always give the same numbers.
 */
export type MonthlyPrice = { date: string; close: number };
export type Mode = "as it happened" | "swings only (no drift)";
export type RangeResult = {
  mode: Mode; p10: number; p50: number; p90: number; // end value as a multiple of today's price
  chanceBeatsHurdle: number; chanceGain: number; chanceBigLoss: number;
};
export type HistoricalRange = {
  observations: number; start: string; end: string; months: number; paths: number; hurdle: number; bigLoss: number;
  annualVolatility: number; annualizedReturn: number; results: RangeResult[]; notes: string[];
};
export const MIN_RETURNS = 60;
export const defaultOptions = { paths: 10000, months: 12, hurdle: 0.15, bigLoss: 0.2, seed: 20261022 };

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function quantile(sorted: number[], p: number) { const x = (sorted.length - 1) * p, i = Math.floor(x); return sorted[i] + (sorted[Math.min(i + 1, sorted.length - 1)] - sorted[i]) * (x - i); }
export function hashSeed(text: string) { let h = 2166136261; for (const c of text) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function historicalRange(prices: MonthlyPrice[], options: Partial<typeof defaultOptions> = {}): HistoricalRange | { unavailable: string } {
  const o = { ...defaultOptions, ...options };
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.some(p => !(p.close > 0) || !Number.isFinite(p.close))) return { unavailable: "The price history has an invalid price." };
  const returns: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = (Date.parse(sorted[i].date) - Date.parse(sorted[i - 1].date)) / 86400000;
    if (!Number.isFinite(gap) || gap < 20 || gap > 45) continue; // skip missing months instead of treating a gap as one month
    returns.push(Math.log(sorted[i].close / sorted[i - 1].close));
  }
  if (returns.length < MIN_RETURNS) return { unavailable: `Only ${returns.length} usable monthly returns; at least ${MIN_RETURNS} (five years) are needed for a meaningful range.` };
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const run = (series: number[], mode: Mode): RangeResult => {
    const next = rng(o.seed), ends: number[] = new Array(o.paths);
    for (let p = 0; p < o.paths; p++) { let sum = 0; for (let m = 0; m < o.months; m++) sum += series[Math.floor(next() * series.length)]; ends[p] = Math.exp(sum); }
    ends.sort((a, b) => a - b);
    const share = (f: (x: number) => boolean) => ends.filter(f).length / ends.length;
    return { mode, p10: quantile(ends, .1), p50: quantile(ends, .5), p90: quantile(ends, .9), chanceBeatsHurdle: share(x => x >= 1 + o.hurdle), chanceGain: share(x => x > 1), chanceBigLoss: share(x => x <= 1 - o.bigLoss) };
  };
  return {
    observations: returns.length, start: sorted[0].date, end: sorted[sorted.length - 1].date, months: o.months, paths: o.paths, hurdle: o.hurdle, bigLoss: o.bigLoss,
    annualVolatility: Math.sqrt(variance * 12), annualizedReturn: Math.exp(mean * 12) - 1,
    results: [run(returns, "as it happened"), run(returns.map(r => r - mean), "swings only (no drift)")],
    notes: [
      "A description of this stock's own past monthly returns, drawn at random. It is not a forecast.",
      "It ignores the business, price paid, new information and changes in market conditions; dividends are included through adjusted prices.",
      "\"As it happened\" inherits the past drift, so a stock that rose a lot looks optimistic. \"Swings only\" removes the drift and shows how much a gain depends on luck.",
    ],
  };
}
