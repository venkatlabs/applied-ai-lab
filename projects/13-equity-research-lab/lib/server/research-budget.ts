import { reserveUsage, usageStore } from './usage-budget';
import { archiveContext } from "./archive";
import { database } from "./supabase";
import type { ResearchRun } from "../types";

// Paid-research guard. Every live report calls OpenAI (web brief + synthesis) and
// market-data providers, so report generation is metered globally per UTC day.
// Reservations include failed attempts and are atomic across workers. Existing
// snapshots establish a usage floor when upgrading from the older counter.

export const DEFAULT_DAILY_CAP = 15;

export function dailyCap(env: Record<string, string | undefined> = process.env) {
  const raw = Number(env.RESEARCH_DAILY_CAP);
  return Number.isInteger(raw) && raw >= 0 && raw <= 500 ? raw : DEFAULT_DAILY_CAP;
}

export function utcDayStart(now = new Date()) {
  return `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
}

export function isLiveMode(env: Record<string, string | undefined> = process.env) {
  return env.NEXT_PUBLIC_APP_MODE === "live";
}

export type BudgetStatus = { metered: boolean; used: number; cap: number; remaining: number; reason?: string };

export function evaluateBudget(used: number | null, cap: number, allowUnmetered: boolean): BudgetStatus {
  if (used === null) {
    return allowUnmetered
      ? { metered: false, used: 0, cap, remaining: cap }
      : { metered: false, used: 0, cap, remaining: 0, reason: "The research budget cannot be verified because the archive database is unavailable. Live research is paused to protect API credits." };
  }
  const remaining = Math.max(0, cap - used);
  return remaining > 0
    ? { metered: true, used, cap, remaining }
    : { metered: true, used, cap, remaining: 0, reason: `Daily research budget reached (${cap} new live reports per UTC day). Saved reports still open. Try again after 00:00 UTC or raise RESEARCH_DAILY_CAP.` };
}

async function liveReportsToday(): Promise<number | null> {
  const db = database();
  if (!db) return null;
  const { count, error } = await db.from("equity_snapshots").select("id", { count: "exact", head: true }).gte("analyzed_at", utcDayStart());
  return error || count == null ? null : count;
}

export async function researchBudget(): Promise<BudgetStatus> {
  const cap = dailyCap();
  if (!isLiveMode()) return { metered: false, used: 0, cap, remaining: cap };
  try {
    const historical=await liveReportsToday();
    if(historical===null)return evaluateBudget(null,cap,false);
    const reserved=await usageStore().read('research',new Date().toISOString().slice(0,10));
    return evaluateBudget(Math.max(historical,reserved??0),cap,false);
  } catch { return evaluateBudget(null,cap,false); }
}

export function reusable(run: ResearchRun | undefined, now = new Date()): run is ResearchRun {
  // Reuse a same-day report only if the AI synthesis completed (investment case present, or a
  // legacy score). Failed runs may be retried; "research incomplete" results are still reused.
  return !!run && run.dataMode !== "demo" && run.analyzedAt >= utcDayStart(now) && (!!run.investmentCase || run.score > 0 || !!run.researchCompletion?.attempted);
}

/** Latest completed report for this ticker from today (UTC), owner-scoped. */
export async function sameDayReport(ticker: string): Promise<ResearchRun | undefined> {
  const ctx = await archiveContext();
  if (!ctx) return undefined;
  const { data, error } = await ctx.db.from("equity_snapshots").select("payload")
    .eq("owner_hash", ctx.owner).eq("ticker", ticker).is("deleted_at", null)
    .gte("analyzed_at", utcDayStart()).order("analyzed_at", { ascending: false }).limit(5);
  if (error) return undefined;
  return (data ?? []).map(row => row.payload as ResearchRun).find(run => reusable(run));
}

export async function claimResearchSlot() {
  if(!isLiveMode())return;
  const floor=await liveReportsToday();
  if(floor===null)throw new Error('Research paused: usage could not be verified.');
  await reserveUsage(usageStore(),'research',new Date().toISOString().slice(0,10),dailyCap(),floor);
}
