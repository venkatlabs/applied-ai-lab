import { archiveContext, latestReports } from "./archive";
import { classifyEdit, classifyRemoval, seedTriggers, triggerInputSchema, type Trigger, type TriggerInput } from "../triggers";

type Row = { id: string; symbol: string; kind: Trigger["kind"]; text: string; metric: Trigger["metric"]; threshold: number | string | null; due: string | null; status: Trigger["status"]; source: Trigger["source"]; report_id: string | null; evidence: string; created_at: string; updated_at: string };
export const toTrigger = (r: Row): Trigger => ({ id: r.id, symbol: r.symbol, kind: r.kind, text: r.text, metric: r.metric, threshold: r.threshold === null ? null : Number(r.threshold), due: r.due, status: r.status, source: r.source, reportId: r.report_id, evidence: r.evidence, createdAt: r.created_at, updatedAt: r.updated_at });
const COLS = "id,symbol,kind,text,metric,threshold,due,status,source,report_id,evidence,created_at,updated_at";

export class StoreError extends Error { constructor(message: string, public status = 400, public code = "error") { super(message); } }
async function ctxOrThrow() { const ctx = await archiveContext(); if (!ctx) throw new StoreError("Account storage unavailable.", 503, "unavailable"); return ctx; }

export async function listTriggers(symbol?: string): Promise<Trigger[]> {
  const ctx = await ctxOrThrow();
  let q = ctx.db.from("equity_triggers").select(COLS).eq("owner_hash", ctx.owner);
  if (symbol) q = q.eq("symbol", symbol);
  const { data, error } = await q.order("created_at", { ascending: true }).limit(500);
  if (error) throw new StoreError("Could not read triggers.", 503, "unavailable");
  return (data as Row[]).map(toTrigger);
}
async function log(ctx: Awaited<ReturnType<typeof ctxOrThrow>>, entry: { symbol: string; trigger_id: string | null; change: string; before?: unknown; after?: unknown; goalpost?: boolean; reason?: string }) {
  await ctx.db.from("equity_trigger_log").insert({ owner_hash: ctx.owner, before: null, after: null, goalpost: false, reason: "", ...entry });
  if (entry.goalpost) await ctx.db.from("equity_alerts").insert({ owner_hash: ctx.owner, symbol: entry.symbol, kind: "trigger", direction: "neutral", headline: `${entry.symbol}: goalpost move on a kill trigger.`, detail: entry.reason ?? "", trigger_id: entry.trigger_id });
}

export async function addTrigger(raw: unknown): Promise<Trigger> {
  const parsed = triggerInputSchema.safeParse(raw);
  if (!parsed.success) throw new StoreError(parsed.error.issues[0]?.message ?? "Invalid trigger.", 400, "invalid");
  const ctx = await ctxOrThrow(), i = parsed.data;
  const { data, error } = await ctx.db.from("equity_triggers").insert({ owner_hash: ctx.owner, symbol: i.symbol, kind: i.kind, text: i.text, metric: i.metric, threshold: i.threshold, due: i.due, source: "user" }).select(COLS).single();
  if (error || !data) throw new StoreError("Could not save the trigger.", 503, "unavailable");
  await log(ctx, { symbol: i.symbol, trigger_id: (data as Row).id, change: "added", after: i });
  return toTrigger(data as Row);
}

export async function seedFromReport(symbol: string): Promise<Trigger[]> {
  const ctx = await ctxOrThrow();
  const run = (await latestReports([symbol]))[symbol];
  if (!run) throw new StoreError("Research this stock first; triggers start from its report.", 404, "no-report");
  const existing = await listTriggers(symbol);
  const seeds = seedTriggers(run, existing);
  if (!seeds.length) return [];
  const { data, error } = await ctx.db.from("equity_triggers").insert(seeds.map(s => ({ owner_hash: ctx.owner, symbol, kind: s.kind, text: s.text, metric: s.metric, threshold: s.threshold, due: s.due, source: s.source, report_id: run.id }))).select(COLS);
  if (error || !data) throw new StoreError("Could not save the triggers.", 503, "unavailable");
  for (const r of data as Row[]) await log(ctx, { symbol, trigger_id: r.id, change: "seeded", after: { text: r.text, kind: r.kind } });
  return (data as Row[]).map(toTrigger);
}

export async function editTrigger(id: string, patch: { text?: string; threshold?: number | null; due?: string | null; status?: Trigger["status"]; reason?: string }): Promise<Trigger> {
  const ctx = await ctxOrThrow();
  const { data: row, error } = await ctx.db.from("equity_triggers").select(COLS).eq("owner_hash", ctx.owner).eq("id", id).maybeSingle();
  if (error || !row) throw new StoreError("Trigger not found.", 404, "not-found");
  const before = toTrigger(row as Row);
  const next = { ...before, text: patch.text ?? before.text, threshold: patch.threshold === undefined ? before.threshold : patch.threshold, due: patch.due === undefined ? before.due : patch.due, status: patch.status ?? before.status };
  const check = triggerInputSchema.safeParse({ symbol: before.symbol, kind: before.kind, text: next.text, metric: before.metric, threshold: next.threshold, due: next.due });
  if (!check.success) throw new StoreError(check.error.issues[0]?.message ?? "Invalid trigger.", 400, "invalid");
  const verdict = classifyEdit(before, next);
  const reason = (patch.reason ?? "").trim();
  if (verdict.goalpost && reason.length < 5) throw new StoreError(`This loosens a kill trigger (${verdict.reasons.join(" ")}). Give a reason of at least a few words; it will be logged as a goalpost move.`, 409, "goalpost-reason-required");
  const { data, error: updateError } = await ctx.db.from("equity_triggers").update({ text: next.text, threshold: next.threshold, due: next.due, status: next.status, updated_at: new Date().toISOString() }).eq("owner_hash", ctx.owner).eq("id", id).select(COLS).single();
  if (updateError || !data) throw new StoreError("Could not save the trigger.", 503, "unavailable");
  await log(ctx, { symbol: before.symbol, trigger_id: id, change: next.status !== before.status && next.text === before.text && next.threshold === before.threshold && next.due === before.due ? "status" : "edited", before: { text: before.text, threshold: before.threshold, due: before.due, status: before.status }, after: { text: next.text, threshold: next.threshold, due: next.due, status: next.status }, goalpost: verdict.goalpost, reason: verdict.goalpost ? `${verdict.reasons.join(" ")} Reason: ${reason}` : reason });
  return toTrigger(data as Row);
}

export async function removeTrigger(id: string, reason: string): Promise<void> {
  const ctx = await ctxOrThrow();
  const { data: row } = await ctx.db.from("equity_triggers").select(COLS).eq("owner_hash", ctx.owner).eq("id", id).maybeSingle();
  if (!row) throw new StoreError("Trigger not found.", 404, "not-found");
  const before = toTrigger(row as Row), verdict = classifyRemoval(before);
  if (verdict.goalpost && reason.trim().length < 5) throw new StoreError("Removing a kill trigger is a goalpost move. Give a reason of at least a few words; it will be logged.", 409, "goalpost-reason-required");
  const { error } = await ctx.db.from("equity_triggers").delete().eq("owner_hash", ctx.owner).eq("id", id);
  if (error) throw new StoreError("Could not remove the trigger.", 503, "unavailable");
  await log(ctx, { symbol: before.symbol, trigger_id: id, change: "removed", before: { text: before.text, kind: before.kind }, goalpost: verdict.goalpost, reason: verdict.goalpost ? `${verdict.reasons.join(" ")} Reason: ${reason.trim()}` : reason.trim() });
}
