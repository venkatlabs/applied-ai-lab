import { database } from "./supabase";
import { readPersonalPortfolio, createPersonalReader } from "./snaptrade-personal";
import { toConnectedSnapshot } from "./snaptrade-snapshot";
import { connectedHoldings } from "../connected-portfolio";
import { runResearch } from "../research-engine";
import { saveSnapshotFor } from "./archive";
import { claimResearchSlot, researchBudget, sameDayReportFor } from "./research-budget";
import { runWeeklyDigest } from "./monitor-run";
import type { Holdings } from "../holdings";
import type { ResearchRun } from "../types";
import {
  COMFORT, LIMIT, AI_INFRASTRUCTURE, clusterWeights, dayIndexOf, describeItem, pickDiscovery, sellFraction, sectorFor, summariseBrief, topConcentrated,
  researchOutcome, type Brief, type BriefItem,
} from "../morning";

type Db = NonNullable<ReturnType<typeof database>>;
type Env = Record<string, string | undefined>;
export type MorningDeps = {
  db: Db; now: Date; env: Env; clock?: () => number;
  loadHoldings: () => Promise<{ holdings: Holdings | null; notes: string[] }>;
  research: (ticker: string) => Promise<{ run: ResearchRun; reused: boolean }>;
  remainingBudget: () => Promise<number>;
};

const intEnv = (v: string | undefined, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : d; };
const FIRST_PHASE_MS = 140_000; // do not start optional discovery research late in the function's time limit

async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)));
  return out;
}

type Budget = { left: number };

/** Step 1: decide what to research and store a brief with every stock waiting. Reads holdings; spends nothing. */
export async function planMorning(owner: string, deps: MorningDeps): Promise<Brief> {
  const { db, now, env } = deps;
  const day = now.toISOString().slice(0, 10), notes: string[] = [];
  const discoveryWanted = intEnv(env.MORNING_DISCOVERY, 2, 0, 5);
  const pinned = (env.MORNING_PINNED ?? "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  const { holdings, notes: holdingNotes } = await deps.loadHoldings().catch(() => ({ holdings: null as Holdings | null, notes: ["Brokerage holdings could not be read."] }));
  notes.push(...holdingNotes);

  let concentrated = holdings ? topConcentrated(holdings, 3, pinned) : [];
  if (!holdings) {
    const { data } = await db.from("equity_briefs").select("payload").eq("owner_hash", owner).order("day", { ascending: false }).limit(1);
    const prev = (data?.[0]?.payload as Brief | undefined)?.concentration?.top.map(t => ({ symbol: t.symbol, weight: t.weightPct / 100, gainPct: t.gainPct, pinned: false }));
    concentrated = pinned.length ? pinned.map(symbol => ({ symbol, weight: 0, gainPct: null, pinned: true })) : prev ?? [];
    notes.push(concentrated.length ? "Using the last known most-concentrated stocks because holdings could not be read." : "No concentrated stocks could be identified.");
  }
  const [followed, recent, reportRows] = await Promise.all([
    db.from("equity_followed").select("symbol").eq("owner_hash", owner).limit(500),
    db.from("equity_snapshots").select("ticker").eq("owner_hash", owner).gte("analyzed_at", new Date(now.getTime() - 30 * 86400000).toISOString()).limit(500),
    db.from("equity_snapshots").select("payload").eq("owner_hash", owner).is("deleted_at", null).order("analyzed_at", { ascending: false }).limit(300),
  ]);
  const previousReports: ResearchRun[] = (reportRows.data ?? []).map(r => r.payload as ResearchRun).filter(r => r.dataMode !== "demo");
  const exclude = new Set<string>([...(followed.data ?? []).map(r => r.symbol as string), ...(recent.data ?? []).map(r => r.ticker as string), ...concentrated.map(c => c.symbol), ...(holdings?.positions ?? []).map(p => p.symbol)]);
  const discovery = pickDiscovery({ dayIndex: dayIndexOf(day), exclude, count: discoveryWanted });
  const clusters = holdings ? clusterWeights(holdings) : [];

  const waiting = (symbol: string, role: BriefItem["role"], sector: string, weight: number | null): BriefItem => {
    const before = previousReports.find(r => r.ticker === symbol);
    return { symbol, role, status: "pending", reportId: null, verdict: null, confidence: null, score: null, previousVerdict: before ? researchOutcome(before, new Date(before.analyzedAt)).verdict : null, changed: false,
      weightPct: weight === null ? null : Number((weight * 100).toFixed(1)), sector, lines: [], costUSD: null, seconds: null };
  };
  const items = [...concentrated.map(c => waiting(c.symbol, "concentrated", sectorFor(c.symbol), holdings ? c.weight : null)), ...discovery.map(d => waiting(d.symbol, "discovery", d.sector, null))];

  const all = holdings ? holdings.positions.filter(p => p.kind === "stock" && p.shares > 0).map(p => ({ symbol: p.symbol, weight: (p.shares * p.price) / holdings.totalValue })).sort((a, b) => b.weight - a.weight) : [];
  const sum = (n: number) => all.slice(0, n).reduce((a, b) => a + b.weight, 0);
  const clusterPct = clusters[0]?.weight ?? null;
  const flags: string[] = [];
  if (all[0] && all[0].weight > 2 * LIMIT) flags.push(`${all[0].symbol} is ${(all[0].weight / LIMIT).toFixed(1)}× your ${Math.round(LIMIT * 100)}% single-stock planning limit.`);
  if (all.length >= 3 && sum(3) > 0.5) flags.push(`Your three largest stocks are ${Math.round(sum(3) * 100)}% of the portfolio.`);
  if (clusterPct !== null && clusterPct > 0.1) flags.push(`AI-infrastructure and semiconductor holdings together are ${Math.round(clusterPct * 100)}% of the portfolio and tend to fall together.`);
  const concentration = holdings ? {
    top: concentrated.map(c => ({ symbol: c.symbol, weightPct: Number((c.weight * 100).toFixed(1)), sector: sectorFor(c.symbol), gainPct: c.gainPct, sellToLimitPct: Math.round(sellFraction(c.weight, LIMIT) * 100) })),
    top3Pct: Number((sum(3) * 100).toFixed(1)), top5Pct: Number((sum(5) * 100).toFixed(1)),
    clusters: clusters.map(c => ({ name: c.name, weightPct: Number((c.weight * 100).toFixed(1)), symbols: c.symbols })), flags,
  } : null;
  void COMFORT;
  return finalizeBrief({ day, generatedAt: now.toISOString(), status: "partial", summary: "", concentration, items, cost: { estimatedUSD: null, reports: 0 }, notes });
}

/** Recompute status, summary and cost from the items. */
export function finalizeBrief(brief: Brief): Brief {
  const spent = brief.items.filter(i => i.status === "researched");
  const costKnown = spent.length > 0 && spent.every(i => i.costUSD !== null);
  const { status, summary } = summariseBrief(brief.items, brief.concentration?.flags.slice(0, 1) ?? []);
  return { ...brief, status, summary, cost: { estimatedUSD: costKnown ? Number(spent.reduce((a, i) => a + (i.costUSD ?? 0), 0).toFixed(2)) : null, reports: spent.length } };
}

/** Step 2: research one waiting stock (reusing today's report if there is one) and return the updated item. */
export async function researchItem(owner: string, deps: MorningDeps, brief: Brief, item: BriefItem, budget: Budget): Promise<BriefItem> {
  const { db, now } = deps;
  const clusterPct = brief.concentration?.clusters[0] ? brief.concentration.clusters[0].weightPct / 100 : null;
  try {
    const today = await sameDayReportFor({ owner, db }, item.symbol);
    if (!today && budget.left <= 0) return { ...item, status: "skipped", note: "Skipped: no research budget left today." };
    if (!today) budget.left--;
    const { run, reused } = today ? { run: today, reused: true } : await deps.research(item.symbol);
    const o = researchOutcome(run, now), weight = item.weightPct === null ? null : item.weightPct / 100;
    return { ...item, status: reused ? "reused" : "researched", reportId: run.id, verdict: o.verdict, confidence: o.confidence, score: o.score,
      changed: !!item.previousVerdict && item.previousVerdict !== o.verdict,
      lines: describeItem(o, weight, item.previousVerdict, item.sector, clusterPct, (AI_INFRASTRUCTURE as readonly string[]).includes(item.symbol)),
      costUSD: run.cost?.estimatedUSD ?? null, seconds: typeof run.cost?.durationMs === "number" ? Math.round(run.cost.durationMs / 1000) : null, note: undefined };
  } catch (e) { return { ...item, status: "failed", note: e instanceof Error ? e.message.slice(0, 200) : "Research failed." }; }
}

export async function saveBrief(owner: string, deps: Pick<MorningDeps, "db">, brief: Brief): Promise<void> {
  await deps.db.from("equity_briefs").upsert({ owner_hash: owner, day: brief.day, payload: brief }, { onConflict: "owner_hash,day" });
}
export async function alertChanges(owner: string, deps: Pick<MorningDeps, "db">, items: BriefItem[]): Promise<void> {
  const changes = items.filter(i => i.changed && i.verdict && (i.status === "researched"));
  if (changes.length) await deps.db.from("equity_alerts").insert(changes.map(i => ({ owner_hash: owner, symbol: i.symbol, kind: "verdict", direction: i.verdict === "Buy / Add" ? "bull" : i.verdict === "Trim" || i.verdict === "Sell / Avoid" ? "bear" : "neutral", headline: `${i.symbol}: verdict changed from ${i.previousVerdict} to ${i.verdict}.`, detail: "From a fresh report in the morning brief.", trigger_id: null })));
}

/** All steps in one go, for the scheduled job. */
export async function runMorningForOwner(owner: string, deps: MorningDeps): Promise<Brief> {
  const { env } = deps, clock = deps.clock ?? Date.now, started = clock();
  const maxTotal = intEnv(env.MORNING_RESEARCH_MAX, 5, 1, 10);
  const planned = await planMorning(owner, deps);
  const budget: Budget = { left: Math.min(maxTotal, await deps.remainingBudget()) };
  const concentrated = planned.items.filter(i => i.role === "concentrated"), discovery = planned.items.filter(i => i.role === "discovery");
  const items: BriefItem[] = await inBatches(concentrated, 3, i => researchItem(owner, deps, planned, i, budget));
  const notes = [...planned.notes];
  if (discovery.length) {
    if (clock() - started > FIRST_PHASE_MS) { notes.push("New-stock search was skipped: the concentrated stocks took too long."); items.push(...discovery.map(d => ({ ...d, status: "skipped" as const, note: "Skipped: time ran short." }))); }
    else items.push(...await inBatches(discovery, 2, d => researchItem(owner, deps, planned, d, budget)));
  }
  const brief = finalizeBrief({ ...planned, items, notes });
  await saveBrief(owner, deps, brief);
  await alertChanges(owner, deps, items);
  return brief;
}

async function realHoldings(env: Env, now: Date): Promise<{ holdings: Holdings | null; notes: string[] }> {
  if (env.SNAPTRADE_PORTAL_ENABLED !== "true") return { holdings: null, notes: ["Direct brokerage reading is not enabled, so concentration was not measured."] };
  const snap = toConnectedSnapshot(await readPersonalPortfolio(createPersonalReader(), now, { institutions: ["Fidelity", "Robinhood"] }));
  const usable = snap.accounts.filter(a => Number(a.reportedTotal?.amount) > 0 && a.reportedTotal?.currency?.toUpperCase() === "USD");
  const notes = usable.length < snap.accounts.length ? [`${snap.accounts.length - usable.length} account(s) with no positive USD total were left out.`] : [];
  if (!usable.length) return { holdings: null, notes: [...notes, "No account had a usable total."] };
  const result = connectedHoldings({ ...snap, accounts: usable });
  return { holdings: result.holdings, notes: [...notes, ...result.notes.slice(0, 2)] };
}

/** Owners to prepare for: signed-in accounts that are on the allowlist. */
export async function morningOwners(db: Db, env: Env): Promise<string[]> {
  const allowed = (env.OWNER_EMAILS ?? "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean);
  const { data } = await db.from("equity_accounts").select("owner_hash,email").limit(20);
  const accounts = (data ?? []).filter(a => allowed.includes(String(a.email).toLowerCase())).map(a => a.owner_hash as string);
  return accounts;
}

/** Real dependencies for one owner: brokerage read, shared research budget, paid research saved to that owner. */
export function morningDepsFor(owner: string, db: Db, now: Date, env: Env): MorningDeps {
  return {
    db, now, env,
    loadHoldings: () => realHoldings(env, now),
    remainingBudget: async () => { const b = await researchBudget(); return b.reason ? 0 : b.remaining; },
    research: async ticker => { await claimResearchSlot(); const run = await runResearch(ticker); const saved = await saveSnapshotFor({ owner, db }, run); return { run: saved, reused: false }; },
  };
}

export async function runMorningJob(now = new Date(), env: Env = process.env) {
  const db = database(), day = now.toISOString().slice(0, 10), dow = now.getUTCDay();
  const usage = { owners: 0, reports: 0, failed: 0 };
  if (!db) return { ok: false, summary: "Account storage is unavailable.", usage };
  const parts: string[] = [];
  if (dow === 0) parts.push((await runWeeklyDigest(now)).summary);
  const weekend = dow === 0 || dow === 6;
  if (env.MORNING_RESEARCH_ENABLED !== "true") parts.push("Morning research is off (set MORNING_RESEARCH_ENABLED=true).");
  else if (weekend && env.MORNING_WEEKENDS !== "true") parts.push("No morning research on weekends.");
  else {
    const owners = await morningOwners(db, env);
    usage.owners = owners.length;
    if (!owners.length) parts.push("No signed-in owner account was found; sign in once to enable the morning brief.");
    for (const owner of owners) {
      const brief = await runMorningForOwner(owner, morningDepsFor(owner, db, now, env));
      usage.reports += brief.cost.reports; usage.failed += brief.items.filter(i => i.status === "failed").length;
      parts.push(brief.summary);
    }
  }
  const summary = parts.join(" ");
  await db.from("equity_monitor_runs").insert({ kind: "morning", day, summary, usage, ok: usage.failed === 0 });
  return { ok: usage.failed === 0, summary, usage };
}
