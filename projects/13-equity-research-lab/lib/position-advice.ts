import type { Holdings } from "./holdings";
import type { QuickCheck } from "./quick-check";
import type { ResearchRun } from "./types";
import { researchOutcome } from "./outcome";
import { DEFAULT_LIMITS } from "./diversification";

// Hold / add / trim / review for each saved holding. Transparent rules combining three
// inputs, in this priority: (1) concentration vs your limit, (2) a recent full research
// report's decision, (3) the quick-check valuation zone. Research aid, not advice.

export type PositionAction = "Trim to limit" | "Review selling" | "Trim candidate" | "Hold" | "Hold, don't add" | "Add candidate" | "Check value first" | "Hold (fund)";

export type PositionAdvice = {
  symbol: string; value: number; weight: number; action: PositionAction; amount?: number;
  reasons: string[]; zone?: QuickCheck["zone"]; reportAction?: string; unrealizedGainPct?: number;
};

const DAY = 86400000;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `$${Math.round(x).toLocaleString("en-US")}`;

export function adviseHoldings(h: Holdings, checks: Record<string, QuickCheck>, runs: ResearchRun[], limits = DEFAULT_LIMITS, now = new Date()): PositionAdvice[] {
  const cap = limits.singleStock * h.totalValue;
  return h.positions.filter(p => p.shares > 0).map(p => {
    const value = p.shares * p.price, weight = h.totalValue > 0 ? value / h.totalValue : 0;
    const gain = p.averageCost && p.averageCost > 0 ? p.price / p.averageCost - 1 : undefined;
    const taxNote = gain != null && gain > 0 ? ` Selling realizes part of a ${pct(gain)} gain; check taxes and consider staged sales.` : "";
    if (p.kind === "fund") return { symbol: p.symbol, value, weight, action: "Hold (fund)" as const, reasons: ["Fund holdings and leverage have not been assessed. Sector, thematic and single-stock funds can be concentrated; review their underlying exposure."] };

    const savedCheck=checks[p.symbol];
    const fresh=(date:string|undefined,limit:number)=>{const age=(now.getTime()-Date.parse(date??''))/DAY;return Number.isFinite(age)&&age>=0&&age<=limit;};
    const check=savedCheck&&fresh(savedCheck.checkedAt,7)&&fresh(savedCheck.priceDate,7)?savedCheck:undefined;
    const report = runs.filter(r => r.ticker === p.symbol && r.dataMode !== "demo" && fresh(r.analyzedAt,90))
      .sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt))[0];
    // One outcome model everywhere: a verdict with a confidence, never a withheld answer.
    const outcome = report ? researchOutcome(report, now) : undefined;
    const reportAge = report ? Math.floor((now.getTime() - Date.parse(report.analyzedAt)) / DAY) : 0;
    const reportAction = !outcome || outcome.verdict === "Not researched" ? undefined
      : outcome.verdict === "Buy / Add" ? (fresh(report?.marketAsOf,7) && reportAge <= 30 ? "Buy candidate" : "Older buy view — refresh price and valuation")
      : outcome.verdict === "Sell / Avoid" ? "Avoid / review selling"
      : outcome.verdict === "Trim" ? "Trim candidate" : "Hold";
    const decision = outcome ? { score: outcome.score } : undefined;
    const zone = check?.zone;
    const reasons: string[] = [];
    const base = { symbol: p.symbol, value, weight, zone, reportAction, unrealizedGainPct: gain != null ? Number((gain * 100).toFixed(1)) : undefined };

    if (weight > 2 * limits.singleStock) {
      reasons.push(`${pct(weight)} of the portfolio is more than twice your ${pct(limits.singleStock)} single-stock limit; concentration risk dominates the valuation view.${taxNote}`);
      return { ...base, action: "Trim to limit" as const, amount: value - cap, reasons };
    }
    if (reportAction === "Avoid / review selling") {
      reasons.push(`Your full report from ${report!.analyzedAt.slice(0, 10)} rated it "${reportAction}" (score ${decision!.score}).${taxNote}`);
      return { ...base, action: "Review selling" as const, reasons };
    }
    if (reportAction === "Trim candidate") {
      reasons.push(`Your full report from ${report!.analyzedAt.slice(0, 10)} leans negative: "${outcome!.headline}" (score ${decision!.score}).${taxNote}`);
      return { ...base, action: "Trim candidate" as const, reasons };
    }
    if (weight > limits.singleStock) {
      if (zone === "Expensive") { reasons.push(`Above your limit (${pct(weight)}) and priced above its intrinsic value range.${taxNote}`); return { ...base, action: "Trim candidate" as const, amount: value - cap, reasons }; }
      reasons.push(`Above your ${pct(limits.singleStock)} limit (${pct(weight)}); don't add. ${zone ? `Valuation: ${zone}.` : "Run a quick check for valuation."}`);
      return { ...base, action: "Hold, don't add" as const, reasons };
    }
    const room = Math.max(0, cap - value);
    if (reportAction === "Buy candidate" || (!reportAction && zone === "Buy zone")) {
      reasons.push(reportAction === "Buy candidate" ? `Full report (${report!.analyzedAt.slice(0, 10)}) rated it a buy candidate.` : `Quick check: at least 15% below base intrinsic value (buy below ${check?.buyBelow != null ? `$${check.buyBelow.toFixed(2)}` : "n/a"}).`);
      if (!report) reasons.push("Run a full research report before adding — the quick check has no qualitative evidence.");
      reasons.push(`Room under your limit: about ${usd(room)}.`);
      return room > 0 ? { ...base, action: "Add candidate" as const, amount: room, reasons } : { ...base, action: "Hold, don't add" as const, reasons };
    }
    if (!check && !reportAction) return { ...base, action: "Check value first" as const, reasons: ["No quick check or recent report yet."] };
    if (zone === "Expensive") reasons.push("Priced above its intrinsic value range; hold only while the thesis holds and don't add at this price.");
    else if (zone === "Not valued") reasons.push(check?.valuation.available === false ? `Not valued by the DCF: ${check.valuation.note}` : "Not valued.");
    else reasons.push(zone ? `Valuation: ${zone}.` : `Full report (${report!.analyzedAt.slice(0, 10)}): ${outcome!.headline}${reportAge > 30 ? ` It is ${reportAge} days old; refresh when you can.` : ""}`);
    return { ...base, action: "Hold" as const, reasons };
  }).sort((a, b) => b.weight - a.weight);
}
