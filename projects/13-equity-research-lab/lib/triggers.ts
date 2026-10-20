import { z } from "zod";
import type { ResearchRun } from "./types";
import { hurdleView } from "./hurdle";
import { validDate } from "./thesis-review";

/**
 * Pre-committed conditions for revisiting a thesis. Kill triggers say when to give up on it; upgrade triggers say
 * what would justify a full re-review. Status is computed in code from prices and dates, never by a model, and a
 * tripped trigger only asks for a human re-review: nothing here trades or upgrades a verdict automatically.
 */
export const triggerKinds = ["kill", "upgrade"] as const;
export const triggerMetrics = ["manual", "price_below", "price_above"] as const;
export const triggerStatuses = ["armed", "watch", "tripped"] as const;
export type TriggerKind = (typeof triggerKinds)[number];
export type TriggerMetric = (typeof triggerMetrics)[number];
export type TriggerStatus = (typeof triggerStatuses)[number];

export type Trigger = {
  id: string; symbol: string; kind: TriggerKind; text: string; metric: TriggerMetric; threshold: number | null; due: string | null;
  status: TriggerStatus; source: "report" | "user" | "hurdle"; reportId: string | null; evidence: string; createdAt: string; updatedAt: string;
};
export type TriggerFields = Pick<Trigger, "kind" | "text" | "metric" | "threshold" | "due">;

const symbol = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z.\-]{0,9}$/);
const date = z.string().refine(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && validDate(v), "Use a valid date (YYYY-MM-DD).");
export const triggerInputSchema = z.object({
  symbol, kind: z.enum(triggerKinds), text: z.string().trim().min(3).max(300),
  metric: z.enum(triggerMetrics).default("manual"), threshold: z.number().finite().positive().max(1e7).nullable().default(null), due: date.nullable().default(null),
}).refine(v => v.metric === "manual" || v.threshold !== null, { message: "A price trigger needs a price.", path: ["threshold"] })
  .refine(v => v.metric === "manual" || v.kind === "kill" || v.kind === "upgrade", { message: "Invalid trigger." });
export type TriggerInput = z.infer<typeof triggerInputSchema>;

export const WATCH_BAND = 0.05;
const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Loosening a kill trigger (easier to ignore) is a goalpost move. Tightening or adding is normal. */
export function classifyEdit(before: TriggerFields & { status: TriggerStatus }, after: TriggerFields & { status: TriggerStatus }): { goalpost: boolean; reasons: string[] } {
  if (before.kind !== "kill") return { goalpost: false, reasons: [] };
  const reasons: string[] = [];
  if (after.metric !== before.metric) reasons.push("The measure changed.");
  else if (before.threshold !== null && after.threshold !== null) {
    if (before.metric === "price_below" && after.threshold < before.threshold) reasons.push("The price threshold was lowered, so it is harder to trip.");
    if (before.metric === "price_above" && after.threshold > before.threshold) reasons.push("The price threshold was raised, so it is harder to trip.");
  }
  if (before.due && (!after.due || after.due > before.due)) reasons.push("The test date was extended or removed.");
  if (after.text.trim() !== before.text.trim()) reasons.push("The wording changed; confirm it is not softer.");
  if (before.status === "tripped" && after.status !== "tripped") reasons.push("A tripped kill trigger was cleared.");
  return { goalpost: reasons.length > 0, reasons };
}
export const classifyRemoval = (t: Pick<Trigger, "kind">) => ({ goalpost: t.kind === "kill", reasons: t.kind === "kill" ? ["A kill trigger was removed."] : [] });

/** Status from the latest price and today's date. Tripped is sticky: only the owner can clear it. */
export function evaluateTrigger(t: Trigger, price: number | null, today: string): { status: TriggerStatus; evidence: string } | null {
  if (t.status === "tripped") return null;
  if (t.metric !== "manual" && t.threshold !== null && price !== null && price > 0) {
    const below = t.metric === "price_below";
    const tripped = below ? price < t.threshold : price > t.threshold;
    const near = below ? price <= t.threshold * (1 + WATCH_BAND) : price >= t.threshold * (1 - WATCH_BAND);
    const status: TriggerStatus = tripped ? "tripped" : near ? "watch" : "armed";
    if (status === t.status) return null;
    return { status, evidence: `Price $${price.toFixed(2)} on ${today} versus $${t.threshold.toFixed(2)}.` };
  }
  if (t.metric === "manual" && t.due && today >= t.due && t.status === "armed")
    return { status: "watch", evidence: `Test date ${t.due} reached; check the evidence yourself. It is never tripped automatically.` };
  return null;
}

export type SeedInput = Pick<TriggerInput, "kind" | "text" | "metric" | "threshold" | "due"> & { source: Trigger["source"] };
/** Starting triggers from a report's own thesis killers, review checks and the hurdle price. Never invents a threshold. */
export function seedTriggers(run: ResearchRun, existing: Pick<Trigger, "text">[] = []): SeedInput[] {
  const seen = new Set(existing.map(e => key(e.text)));
  const out: SeedInput[] = [];
  const add = (s: SeedInput) => { const k = key(s.text); if (k && !seen.has(k)) { seen.add(k); out.push(s); } };
  for (const text of (run.thesisKillers ?? []).slice(0, 4)) if (text.trim().length >= 3) add({ kind: "kill", text: text.trim().slice(0, 300), metric: "manual", threshold: null, due: null, source: "report" });
  for (const c of run.thesisReview?.checks ?? []) {
    if (!c.reviewCondition?.trim()) continue;
    add({ kind: "kill", text: `Reconsider if: ${c.reviewCondition.trim()}`.slice(0, 300), metric: "manual", threshold: null, due: c.reviewBy && validDate(c.reviewBy) ? c.reviewBy : null, source: "report" });
  }
  const h = hurdleView(run);
  if (h && h.hurdlePrice > 0) add({ kind: "upgrade", text: `Price at or below $${h.hurdlePrice.toFixed(2)} clears the ${Math.round(h.hurdle * 100)}% hurdle on the saved model. Asks for a full re-review, not an automatic upgrade.`, metric: "price_below", threshold: Number(h.hurdlePrice.toFixed(2)), due: null, source: "hurdle" });
  return out;
}

export type AlertDraft = { symbol: string; kind: "trigger" | "hurdle" | "event" | "verdict"; direction: "bull" | "bear" | "neutral"; headline: string; detail: string; triggerId: string | null };
export function alertForStatusChange(t: Trigger, next: { status: TriggerStatus; evidence: string }): AlertDraft | null {
  if (next.status === "armed") return null;
  const tripped = next.status === "tripped";
  return {
    symbol: t.symbol, kind: "trigger", triggerId: t.id, detail: next.evidence,
    direction: t.kind === "kill" ? (tripped ? "bear" : "neutral") : tripped ? "bull" : "neutral",
    headline: t.kind === "kill"
      ? tripped ? `${t.symbol}: kill trigger tripped. Review the thesis.` : `${t.symbol}: kill trigger moving toward its threshold.`
      : tripped ? `${t.symbol}: upgrade trigger tripped. A full re-review is due; the verdict is unchanged.` : `${t.symbol}: upgrade trigger approaching.`,
  };
}
