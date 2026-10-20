import type { ResearchRun } from "./types";
import { hurdleView } from "./hurdle";
import { alertForStatusChange, evaluateTrigger, type AlertDraft, type Trigger, type TriggerStatus } from "./triggers";

/** Pure plan for one owner's daily check. The server applies it; nothing here reads or spends anything. */
export type Price = { price: number; date: string };
export type MonitorPlan = {
  statusUpdates: { id: string; status: TriggerStatus; evidence: string; symbol: string; previous: TriggerStatus }[];
  alerts: AlertDraft[];
  states: { symbol: string; inBuyZone: boolean; lastPrice: number; lastDate: string }[];
};
export type PriorState = { symbol: string; inBuyZone: boolean | null };

export function planMonitor(input: {
  today: string; prices: Record<string, Price | undefined>; triggers: Trigger[]; latestReports: Record<string, ResearchRun | undefined>; prior: PriorState[];
}): MonitorPlan {
  const plan: MonitorPlan = { statusUpdates: [], alerts: [], states: [] };
  const prior = new Map(input.prior.map(p => [p.symbol, p.inBuyZone]));
  for (const t of input.triggers) {
    const p = input.prices[t.symbol];
    const next = evaluateTrigger(t, p?.price ?? null, p?.date ?? input.today);
    if (!next) continue;
    plan.statusUpdates.push({ id: t.id, status: next.status, evidence: next.evidence, symbol: t.symbol, previous: t.status });
    const a = alertForStatusChange(t, next);
    if (a) plan.alerts.push(a);
  }
  for (const [symbol, p] of Object.entries(input.prices)) {
    if (!p) continue;
    const view = hurdleView(input.latestReports[symbol], p);
    if (!view) continue;
    const inZone = view.referencePrice <= view.hurdlePrice;
    plan.states.push({ symbol, inBuyZone: inZone, lastPrice: p.price, lastDate: p.date });
    const before = prior.get(symbol);
    if (before === undefined || before === null || before === inZone) continue;
    plan.alerts.push({
      symbol, kind: "hurdle", triggerId: null, direction: inZone ? "bull" : "neutral",
      headline: inZone ? `${symbol}: price is now at or below the hurdle price ($${view.hurdlePrice.toFixed(2)}).` : `${symbol}: price moved back above the hurdle price ($${view.hurdlePrice.toFixed(2)}).`,
      detail: `Price $${p.price.toFixed(2)} on ${p.date}. Based on the saved five-case model's assumption-weighted value, not a validated forecast. A review prompt, not advice.`,
    });
  }
  return plan;
}
