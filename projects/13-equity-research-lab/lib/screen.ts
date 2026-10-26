/**
 * Quick screen: a free, AI-free look at a stock from filings, the quote, the deterministic DCF and the peer multiple.
 * It decides whether a stock deserves a paid deep report. It is not a verdict, has no score out of 100 and never
 * says buy or sell. Missing inputs count as neutral and are listed.
 */
export type ScreenSignal = { key: "valuation" | "peers" | "cash" | "growth" | "momentum" | "balance"; label: string; score: -1 | 0 | 1; detail: string };
export type ScreenLabel = "Worth a deep look" | "Mixed" | "Skip for now";
export type ScreenResult = { label: ScreenLabel; total: number; signals: ScreenSignal[]; missing: string[]; note: string };

export type ScreenInput = {
  price: number; priceAvg50?: number; priceAvg200?: number;
  netIncome?: number; freeCashFlow?: number; operatingCashFlow?: number; cash?: number; debt?: number;
  intrinsic?: { available: boolean; upsidePct?: number } | null; growth?: number | null; peerRelativeDiscount?: number | null;
};
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
export const SCREEN_THRESHOLDS = { promising: 3, skip: -2 } as const;

export function buildScreen(i: ScreenInput): ScreenResult {
  const signals: ScreenSignal[] = [], missing: string[] = [];
  const add = (key: ScreenSignal["key"], label: string, score: -1 | 0 | 1, detail: string) => signals.push({ key, label, score, detail });

  // Deterministic DCF versus the price (upsidePct is in percent, as the engine reports it)
  if (i.intrinsic?.available && typeof i.intrinsic.upsidePct === "number") {
    const u = i.intrinsic.upsidePct / 100;
    add("valuation", "Price versus modeled value", u >= 0.15 ? 1 : u <= -0.15 ? -1 : 0, `The modeled base value is ${u >= 0 ? "" : "−"}${pct(Math.abs(u))} ${u >= 0 ? "above" : "below"} the price (illustrative, not a target).`);
  } else { missing.push("a modeled value"); add("valuation", "Price versus modeled value", 0, "No modeled value; neutral."); }

  if (typeof i.peerRelativeDiscount === "number") {
    const d = i.peerRelativeDiscount;
    add("peers", "Multiple versus peers", d >= 0.1 ? 1 : d <= -0.2 ? -1 : 0, `Trades ${d >= 0 ? `${pct(d)} below` : `${pct(-d)} above`} the peer median multiple.`);
  } else { missing.push("a peer comparison"); add("peers", "Multiple versus peers", 0, "No dated peer comparison; neutral."); }

  if (typeof i.netIncome === "number" || typeof i.freeCashFlow === "number") {
    const loss = (i.netIncome ?? 1) < 0, burn = (i.freeCashFlow ?? 1) < 0;
    const good = (i.netIncome ?? 0) > 0 && (i.freeCashFlow ?? i.operatingCashFlow ?? 0) > 0;
    add("cash", "Profit and cash", loss && burn ? -1 : good ? 1 : 0, loss && burn ? "Loss-making and burning cash in the latest year." : good ? "Profitable with positive cash generation in the latest year." : "Mixed: profit or cash generation is weak or unclear.");
  } else { missing.push("annual profit and cash figures"); add("cash", "Profit and cash", 0, "Not available; neutral."); }

  if (typeof i.growth === "number") add("growth", "Expected growth", i.growth >= 0.1 ? 1 : i.growth <= 0.03 ? -1 : 0, `Consensus revenue growth of about ${pct(i.growth)} a year.`);
  else { missing.push("consensus growth"); add("growth", "Expected growth", 0, "No consensus forecast; neutral."); }

  if (i.priceAvg50 && i.priceAvg200 && i.price > 0) {
    const above = Number(i.price > i.priceAvg50) + Number(i.price > i.priceAvg200);
    add("momentum", "Price trend", above === 2 ? 1 : above === 0 ? -1 : 0, above === 2 ? "Above its 50- and 200-day averages." : above === 0 ? "Below its 50- and 200-day averages." : "Between its 50- and 200-day averages.");
  } else { missing.push("moving averages"); add("momentum", "Price trend", 0, "Not available; neutral."); }

  if (typeof i.cash === "number" && typeof i.debt === "number") add("balance", "Balance sheet", i.cash >= i.debt ? 1 : i.debt > 3 * Math.max(i.cash, 1) ? -1 : 0, i.cash >= i.debt ? "Cash covers its debt." : "Debt is above cash.");
  else { missing.push("cash and debt"); add("balance", "Balance sheet", 0, "Not available; neutral."); }

  const total = signals.reduce((a, s) => a + s.score, 0);
  const label: ScreenLabel = total >= SCREEN_THRESHOLDS.promising ? "Worth a deep look" : total <= SCREEN_THRESHOLDS.skip ? "Skip for now" : "Mixed";
  return { label, total, signals, missing, note: "A quick screen from filings and prices, with no AI. It only suggests whether a paid deep report is worth running. It is not a rating or advice." };
}
