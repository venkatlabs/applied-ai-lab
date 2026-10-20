import { database } from "./supabase";
import { providers } from "../providers";
import { reserveUsage, usageStore } from "./usage-budget";
import { isLiveMode } from "./research-budget";
import { planMonitor, type Price } from "../monitor";
import { buildCalendar } from "../calendar";
import { buildDigest } from "../digest";
import { researchOutcome } from "../outcome";
import { toTrigger } from "./triggers-store";
import type { ResearchRun } from "../types";

export const MAX_SYMBOLS = 60;
export function monitorCap(env: Record<string, string | undefined> = process.env) {
  const n = Number(env.MONITOR_DAILY_CAP);
  return Number.isInteger(n) && n >= 0 && n <= 500 ? n : 80;
}
const COLS = "id,symbol,kind,text,metric,threshold,due,status,source,report_id,evidence,created_at,updated_at";

type Db = NonNullable<ReturnType<typeof database>>;
async function latestFor(db: Db, owner: string, symbols: string[]) {
  const { data } = await db.from("equity_snapshots").select("payload").eq("owner_hash", owner).is("deleted_at", null).in("ticker", symbols).order("analyzed_at", { ascending: false }).limit(300);
  const out: Record<string, ResearchRun> = {};
  for (const row of data ?? []) { const run = row.payload as ResearchRun; if (run.dataMode !== "demo" && !out[run.ticker]) out[run.ticker] = run; }
  return out;
}

/** Daily, no-LLM check: refresh prices (metered), recompute triggers and buy-zone state, write alerts. */
export async function runDailyMonitor(now = new Date(), fetchPrice?: (symbol: string) => Promise<Price | undefined>) {
  const db = database();
  const day = now.toISOString().slice(0, 10);
  const usage = { symbols: 0, priced: 0, failed: 0, skipped: 0, alerts: 0, updates: 0 };
  if (!db) return { ok: false, summary: "Account storage is unavailable.", usage };
  if (!fetchPrice && !isLiveMode()) return { ok: true, summary: "Skipped: live market data is not enabled.", usage };
  const getPrice = fetchPrice ?? (async (symbol: string): Promise<Price | undefined> => {
    await reserveUsage(usageStore(), "monitor", day, monitorCap());
    const m = await providers.market.getMarket(symbol);
    const date = m.timestamp?.slice(0, 10);
    return m.price && m.price > 0 && date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? { price: m.price, date } : undefined;
  });
  const [followed, trigRows] = await Promise.all([
    db.from("equity_followed").select("owner_hash,symbol").limit(2000),
    db.from("equity_triggers").select(`owner_hash,${COLS}`).limit(2000),
  ]);
  if (followed.error || trigRows.error) return { ok: false, summary: "Could not read the watch list.", usage };
  const owners = new Map<string, Set<string>>();
  for (const r of followed.data ?? []) owners.set(r.owner_hash, (owners.get(r.owner_hash) ?? new Set()).add(r.symbol));
  for (const r of trigRows.data ?? []) owners.set(r.owner_hash, (owners.get(r.owner_hash) ?? new Set()).add(r.symbol));
  const symbols = [...new Set([...owners.values()].flatMap(s => [...s]))].slice(0, MAX_SYMBOLS);
  usage.symbols = symbols.length;
  const prices: Record<string, Price | undefined> = {};
  let capped = false;
  for (const s of symbols) {
    if (capped) { usage.skipped++; continue; }
    try { prices[s] = await getPrice(s); if (prices[s]) usage.priced++; else usage.failed++; }
    catch (e) { usage.failed++; if (e instanceof Error && /limit reached|paused/i.test(e.message)) capped = true; }
  }
  for (const [owner, set] of owners) {
    const mine = [...set];
    const reports = await latestFor(db, owner, mine);
    const triggers = (trigRows.data ?? []).filter(r => r.owner_hash === owner).map(r => toTrigger(r as never));
    const { data: priorRows } = await db.from("equity_monitor_state").select("symbol,in_buy_zone").eq("owner_hash", owner);
    const plan = planMonitor({ today: day, prices: Object.fromEntries(mine.map(s => [s, prices[s]])), triggers, latestReports: reports, prior: (priorRows ?? []).map(r => ({ symbol: r.symbol, inBuyZone: r.in_buy_zone })) });
    for (const u of plan.statusUpdates) {
      await db.from("equity_triggers").update({ status: u.status, evidence: u.evidence, updated_at: now.toISOString() }).eq("owner_hash", owner).eq("id", u.id);
      await db.from("equity_trigger_log").insert({ owner_hash: owner, symbol: u.symbol, trigger_id: u.id, change: "status", before: { status: u.previous }, after: { status: u.status }, goalpost: false, reason: u.evidence });
      usage.updates++;
    }
    if (plan.alerts.length) { await db.from("equity_alerts").insert(plan.alerts.map(a => ({ owner_hash: owner, symbol: a.symbol, kind: a.kind, direction: a.direction, headline: a.headline, detail: a.detail, trigger_id: a.triggerId }))); usage.alerts += plan.alerts.length; }
    if (plan.states.length) await db.from("equity_monitor_state").upsert(plan.states.map(s => ({ owner_hash: owner, symbol: s.symbol, in_buy_zone: s.inBuyZone, last_price: s.lastPrice, last_date: s.lastDate, updated_at: now.toISOString() })), { onConflict: "owner_hash,symbol" });
  }
  const summary = `${usage.priced} of ${usage.symbols} prices${capped ? " (daily monitor cap reached)" : ""}, ${usage.updates} trigger changes, ${usage.alerts} alerts.`;
  await db.from("equity_monitor_runs").insert({ kind: "daily", day, summary, usage, ok: true });
  return { ok: true, summary, usage };
}

/** Sunday digest per account: stored, shown in the app. No LLM and no outbound message. */
export async function runWeeklyDigest(now = new Date()) {
  const db = database();
  const day = now.toISOString().slice(0, 10);
  if (!db) return { ok: false, summary: "Account storage is unavailable.", usage: { digests: 0 } };
  const since = new Date(now.getTime() - 8 * 86400000).toISOString();
  const { data: owners } = await db.from("equity_followed").select("owner_hash").limit(2000);
  let made = 0;
  for (const owner of [...new Set((owners ?? []).map(o => o.owner_hash as string))]) {
    const [alerts, trigRows, log, snaps] = await Promise.all([
      db.from("equity_alerts").select("at,symbol,kind,direction,headline").eq("owner_hash", owner).gte("at", since).limit(200),
      db.from("equity_triggers").select(COLS).eq("owner_hash", owner).limit(500),
      db.from("equity_trigger_log").select("at,symbol,reason").eq("owner_hash", owner).eq("goalpost", true).gte("at", since).limit(100),
      db.from("equity_snapshots").select("payload").eq("owner_hash", owner).is("deleted_at", null).order("analyzed_at", { ascending: false }).limit(300),
    ]);
    const triggers = (trigRows.data ?? []).map(r => toTrigger(r as never));
    const runs = (snaps.data ?? []).map(r => r.payload as ResearchRun).filter(r => r.dataMode !== "demo");
    const byTicker = new Map<string, ResearchRun[]>();
    for (const r of runs) byTicker.set(r.ticker, [...(byTicker.get(r.ticker) ?? []), r]);
    const verdictChanges = [...byTicker.entries()].flatMap(([symbol, list]) => {
      if (list.length < 2) return [];
      const [a, b] = list, from = researchOutcome(b, new Date(b.analyzedAt)).verdict, to = researchOutcome(a, new Date(a.analyzedAt)).verdict;
      return from !== to ? [{ symbol, from, to, at: a.analyzedAt }] : [];
    });
    const latest = Object.fromEntries([...byTicker.entries()].map(([k, v]) => [k, v[0]]));
    const calendar = buildCalendar(triggers, latest, day, 3);
    const digest = buildDigest({ weekEnding: day, alerts: (alerts.data ?? []) as never, triggers, goalposts: (log.data ?? []) as never, verdictChanges, upcoming: calendar.weeks.flatMap(w => w.items) });
    await db.from("equity_digests").upsert({ owner_hash: owner, week_ending: day, payload: digest }, { onConflict: "owner_hash,week_ending" });
    made++;
  }
  const summary = `${made} digest${made === 1 ? "" : "s"} written.`;
  await db.from("equity_monitor_runs").insert({ kind: "digest", day, summary, usage: { digests: made }, ok: true });
  return { ok: true, summary, usage: { digests: made } };
}
