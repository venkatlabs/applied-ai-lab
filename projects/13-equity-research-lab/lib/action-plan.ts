import type { Holdings } from "./holdings";
import type { QuickCheck } from "./quick-check";
import type { ResearchRun } from "./types";
import { adviseHoldings, type PositionAdvice } from "./position-advice";
import { DEFAULT_LIMITS } from "./diversification";
import { singleInvestmentDecision } from "./investment";

export type RecommendedActionLabel =
  | "BUY / ADD CANDIDATE"
  | "HOLD"
  | "HOLD — DO NOT ADD"
  | "TRIM CANDIDATE"
  | "SELL / EXIT REVIEW"
  | "RESEARCH FIRST"
  | "REVIEW FUND EXPOSURE"
  | "WAIT / WATCH"
  | "AVOID / DO NOT INITIATE";

export type ActionPriority = "Review now" | "Opportunity" | "Research first" | "Monitor";

export type RecommendedAction = {
  symbol: string;
  label: RecommendedActionLabel;
  priority: ActionPriority;
  valueUsd: number;
  weight: number;
  amountUsd?: number;
  evidence: "full report" | "quick valuation" | "portfolio rules";
  reasons: string[];
  taxContext?: string;
  blockers: string[];
};

export type PortfolioActionPlan = {
  actions: RecommendedAction[];
  blockers: string[];
};

/**
 * Deterministic portfolio action queue. It intentionally reuses the existing
 * position-advice policy instead of creating a second scoring model.
 *
 * The queue is a decision-support layer: it can rank what deserves attention,
 * but it does not know actual tax lots, wash-sale history or fund look-through.
 */
export function portfolioActionPlan(
  holdings: Holdings,
  checks: Record<string, QuickCheck>,
  runs: ResearchRun[],
  limits = DEFAULT_LIMITS,
  now = new Date(),
): PortfolioActionPlan {
  const blockers: string[] = [];
  if (holdings.coverage === "partial") {
    blockers.push("Portfolio coverage is partial; recommendations may change when missing accounts or positions are included.");
  }
  if (holdings.positions.some(p => p.kind === "fund")) {
    blockers.push("Fund and ETF look-through is not yet modeled, so underlying stock and sector overlap can be understated.");
  }

  const positions = new Map(holdings.positions.map(p => [p.symbol, p]));
  const advice = adviseHoldings(holdings, checks, runs, limits, now);
  const actions = advice.map(item => {
    const position = positions.get(item.symbol);
    const actionBlockers: string[] = [];
    let taxContext: string | undefined;
    if (position?.averageCost && position.averageCost > 0) {
      const gain = position.price / position.averageCost - 1;
      if (gain <= -0.05) {
        taxContext = `Approx. ${Math.abs(gain * 100).toFixed(1)}% below average cost. This may deserve a tax-loss review, but actual lots, holding period and cross-account wash-sale history are required before harvesting.`;
      } else if (gain > 0) {
        taxContext = `Approx. ${(gain * 100).toFixed(1)}% above average cost. Any trim/sale amount is pre-tax until the actual lots and holding periods are known.`;
      } else {
        taxContext = "Near average cost. Actual tax lots can still differ materially from the displayed average.";
      }
    } else if (isSaleLike(item.action)) {
      actionBlockers.push("Cost basis/tax lots are unavailable, so the sale review is pre-tax.");
    }
    if (position?.kind === "fund") actionBlockers.push("Underlying fund holdings and overlap are not modeled.");

    return {
      symbol: item.symbol,
      label: labelFor(item.action),
      priority: priorityFor(item.action),
      valueUsd: item.value,
      weight: item.weight,
      ...(item.amount != null ? { amountUsd: item.amount } : {}),
      evidence: item.reportAction ? "full report" as const : item.zone ? "quick valuation" as const : "portfolio rules" as const,
      reasons: item.reasons,
      ...(taxContext ? { taxContext } : {}),
      blockers: actionBlockers,
    };
  }).sort(compareActions);

  return { actions, blockers };
}

export type StockActionSummary = {
  symbol: string;
  label: RecommendedActionLabel;
  reasons: string[];
  portfolioWeight?: number;
  roomUsd?: number;
  taxContext?: string;
  blockers: string[];
  whatChanges?: string;
};

/** Final next-step synthesis for the end of an individual stock report. */
export function stockActionSummary(
  run: ResearchRun,
  holdings?: Holdings | null,
  limits = DEFAULT_LIMITS,
  now = new Date(),
): StockActionSummary {
  const decision = singleInvestmentDecision(run);
  const blockers: string[] = [];
  const reasons: string[] = [];
  const whatChanges = run.investmentCase?.changeMind?.trim() || undefined;

  if (holdings) {
    if (holdings.coverage === "partial") blockers.push("Portfolio coverage is partial.");
    const owned = holdings.positions.find(p => p.symbol === run.ticker && p.shares > 0);
    if (owned) {
      const plan = portfolioActionPlan(holdings, {}, [run], limits, now);
      const action = plan.actions.find(a => a.symbol === run.ticker);
      if (action) {
        return {
          symbol: run.ticker,
          label: action.label,
          reasons: action.reasons,
          portfolioWeight: action.weight,
          ...(action.amountUsd != null ? { roomUsd: action.label === "BUY / ADD CANDIDATE" ? action.amountUsd : undefined } : {}),
          ...(action.taxContext ? { taxContext: action.taxContext } : {}),
          blockers: [...blockers, ...action.blockers],
          ...(whatChanges ? { whatChanges } : {}),
        };
      }
    }

    const currentValue = holdings.positions.find(p => p.symbol === run.ticker)
      ? holdings.positions.find(p => p.symbol === run.ticker)!.shares * holdings.positions.find(p => p.symbol === run.ticker)!.price
      : 0;
    const room = Math.max(0, limits.singleStock * holdings.totalValue - currentValue);
    reasons.push(decision.reason);
    reasons.push(`Portfolio room under the ${(limits.singleStock * 100).toFixed(0)}% single-stock planning limit is about $${Math.round(room).toLocaleString("en-US")} before overlap and taxes.`);
    if (!decision.available) blockers.push(...decision.missing);
    return {
      symbol: run.ticker,
      label: newPositionLabel(decision.action),
      reasons,
      portfolioWeight: holdings.totalValue > 0 ? currentValue / holdings.totalValue : undefined,
      roomUsd: room,
      blockers: [...new Set(blockers)],
      ...(whatChanges ? { whatChanges } : {}),
    };
  }

  reasons.push(decision.reason);
  blockers.push("Portfolio holdings are unavailable, so position sizing and concentration are not included.");
  if (!decision.available) blockers.push(...decision.missing);
  return {
    symbol: run.ticker,
    label: newPositionLabel(decision.action),
    reasons,
    blockers: [...new Set(blockers)],
    ...(whatChanges ? { whatChanges } : {}),
  };
}

function isSaleLike(action: PositionAdvice["action"]) {
  return action === "Trim to limit" || action === "Trim candidate" || action === "Review selling";
}

function labelFor(action: PositionAdvice["action"]): RecommendedActionLabel {
  switch (action) {
    case "Trim to limit":
    case "Trim candidate": return "TRIM CANDIDATE";
    case "Review selling": return "SELL / EXIT REVIEW";
    case "Add candidate": return "BUY / ADD CANDIDATE";
    case "Hold, don't add": return "HOLD — DO NOT ADD";
    case "Check value first": return "RESEARCH FIRST";
    case "Hold (fund)": return "REVIEW FUND EXPOSURE";
    default: return "HOLD";
  }
}

function priorityFor(action: PositionAdvice["action"]): ActionPriority {
  if (action === "Trim to limit" || action === "Trim candidate" || action === "Review selling") return "Review now";
  if (action === "Add candidate") return "Opportunity";
  if (action === "Check value first") return "Research first";
  return "Monitor";
}

function newPositionLabel(action: ReturnType<typeof singleInvestmentDecision>["action"]): RecommendedActionLabel {
  if (action === "Buy candidate") return "BUY / ADD CANDIDATE";
  if (action === "Avoid / review selling") return "AVOID / DO NOT INITIATE";
  if (action === "Research incomplete" || action === "Older report · rerun") return "RESEARCH FIRST";
  return "WAIT / WATCH";
}

const rank: Record<ActionPriority, number> = { "Review now": 0, Opportunity: 1, "Research first": 2, Monitor: 3 };
function compareActions(a: RecommendedAction, b: RecommendedAction) {
  return rank[a.priority] - rank[b.priority] || b.weight - a.weight || a.symbol.localeCompare(b.symbol);
}
