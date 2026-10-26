import { database } from "./supabase";
import { readPersonalPortfolio, createPersonalReader } from "./snaptrade-personal";
import { toConnectedSnapshot } from "./snaptrade-snapshot";
import { connectedHoldings } from "../connected-portfolio";
import { runResearch } from "../research-engine";
import { providers } from "../providers";
import { saveSnapshotFor } from "./archive";
import { claimLightSlot, claimResearchSlot, releaseResearchSlot, researchBudget, sameDayReportFor } from "./research-budget";
import { guardedResearch } from "./guarded-research";
import { providerFailure } from "../provider-failure";
import { runWeeklyDigest } from "./monitor-run";
import type { Holdings } from "../holdings";
import type { ResearchRun } from "../types";
import { isRated } from "../outcome";
import {
  COMFORT, LIMIT, AI_INFRASTRUCTURE, clusterWeights, dayIndexOf, describeItem, pickDiscovery, sellFraction, sectorFor, summariseBrief, topConcentrated,
  researchOutcome, needsDeepRefresh, describeScreen, exitWatchCandidates, type Brief, type BriefItem,
} from "../morning";

type Db = NonNullable<ReturnType<typeof database>>;
type Env = Record<string, string | undefined>;
export type MorningDeps = {
  db: Db; now: Date; env: Env; clock?: () => number;
  loadHoldings: () => Promise<{ holdings: Holdings | null; notes: string[] }>;
  research: (ticker: string) => Promise<{ run: ResearchRun; reused: boolean }>;
  /** Free quick screen (no AI). */
  screen: (ticker: string) => Promise<{ run: ResearchRun; reused: boolean }>;
  /** Current price for the daily refresh gate; null when unavailable. */
  quote: (ticker: string) => Promise<number | null>;
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

  const gate = { maxAgeDays: intEnv(env.MORNING_DEEP_MAX_AGE_DAYS, 7, 1, 60), movePct: intEnv(env.MORNING_DEEP_MOVE_PCT, 7, 1, 50), always: env.MORNING_DEEP_ALWAYS === "true" };
  const exitCount = intEnv(env.MORNING_EXIT_SCAN, 2, 0, 5);
  const waiting = (symbol: string, role: BriefItem["role"], sector: string, weight: number | null, tier: BriefItem["tier"], tierReason: string): BriefItem => {
    const before = previousReports.find(r => r.ticker === symbol && isRated(r));
    return { symbol, role, tier, tierReason, screenLabel: null, status: "pending", reportId: null, verdict: null, confidence: null, score: null, previousVerdict: before ? researchOutcome(before, new Date(before.analyzedAt)).verdict : null, changed: false,
      weightPct: weight === null ? null : Number((weight * 100).toFixed(1)), sector, lines: [], costUSD: null, seconds: null };
  };
  const deepItems: BriefItem[] = [];
  for (const c of concentrated) {
    const report = previousReports.find(r => r.ticker === c.symbol && isRated(r));
    const price = await deps.quote(c.symbol).catch(() => null);
    const g = needsDeepRefresh({ report, price, now, ...gate });
    deepItems.push(waiting(c.symbol, "concentrated", sectorFor(c.symbol), holdings ? c.weight : null, g.deep ? "deep" : "reuse", g.reason));
  }
  const watch = holdings ? exitWatchCandidates(holdings, new Set(concentrated.map(c => c.symbol)), dayIndexOf(day), exitCount) : [];
  const items = [
    ...deepItems,
    ...watch.map(sym => waiting(sym, "exit-watch", sectorFor(sym), null, "light", "Free screen of another holding, looking for an exit or trim candidate.")),
    ...discovery.map(d => waiting(d.symbol, "discovery", d.sector, null, "light", "Free screen of a new idea from a different industry.")),
  ];

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
  const spent = brief.items.filter(i => i.status === "researched" && i.tier === "deep");
  const costKnown = spent.length > 0 && spent.every(i => i.costUSD !== null);
  const deep = brief.items.filter(i => i.tier === "deep" && i.status === "researched").length, screens = brief.items.filter(i => i.tier === "light" && (i.status === "researched" || i.status === "reused")).length;
  const { status, summary } = summariseBrief(brief.items, [`${deep} paid deep report${deep === 1 ? "" : "s"}, ${screens} free screen${screens === 1 ? "" : "s"}`, ...(brief.concentration?.flags.slice(0, 1) ?? [])]);
  return { ...brief, status, summary, cost: { estimatedUSD: costKnown ? Number(spent.reduce((a, i) => a + (i.costUSD ?? 0), 0).toFixed(2)) : null, reports: spent.length } };
}

async function latestRated(db: Db, owner: string, symbol: string): Promise<ResearchRun | undefined> {
  const { data } = await db.from("equity_snapshots").select("payload").eq("owner_hash", owner).eq("ticker", symbol).is("deleted_at", null).order("analyzed_at", { ascending: false }).limit(10);
  return (data ?? []).map(r => r.payload as ResearchRun).find(r => r.dataMode !== "demo" && isRated(r));
}

/** Step 2: do the planned work for one stock. Deep = paid AI report, reuse = latest report stands, light = free quick screen. */
export async function researchItem(owner: string, deps: MorningDeps, brief: Brief, item: BriefItem, budget: Budget): Promise<BriefItem> {
  const { db, now } = deps;
  const clusterPct = brief.concentration?.clusters[0] ? brief.concentration.clusters[0].weightPct / 100 : null;
  const weight = item.weightPct === null ? null : item.weightPct / 100;
  const inAi = (AI_INFRASTRUCTURE as readonly string[]).includes(item.symbol);
  const rated = (run: ResearchRun, status: BriefItem["status"], extra: string[] = []): BriefItem => {
    const o = researchOutcome(run, now);
    return { ...item, status, reportId: run.id, verdict: o.verdict, confidence: o.confidence, score: o.score, changed: status === "researched" && !!item.previousVerdict && item.previousVerdict !== o.verdict,
      lines: [...describeItem(o, weight, item.previousVerdict, item.sector, clusterPct, inAi), ...extra],
      costUSD: run.cost?.estimatedUSD ?? null, seconds: typeof run.cost?.durationMs === "number" ? Math.round(run.cost.durationMs / 1000) : null, note: undefined };
  };
  try {
    if (item.tier === "reuse") {
      const run = await latestRated(db, owner, item.symbol);
      if (!run) return { ...item, tier: "deep", status: "failed", note: "No earlier deep report was found to reuse." };
      return rated(run, "reused", [item.tierReason]);
    }
    if (item.tier === "light") {
      const todayDeep = await sameDayReportFor({ owner, db }, item.symbol);
      if (todayDeep && isRated(todayDeep)) return rated(todayDeep, "reused", ["A deep report from today is available."]);
      const { run } = todayDeep?.screen ? { run: todayDeep } : await deps.screen(item.symbol);
      if (!run.screen) return { ...item, status: "failed", note: (run.notes ?? [])[0] ?? "The quick screen could not be completed." };
      return { ...item, status: todayDeep?.screen ? "reused" : "researched", reportId: run.id, screenLabel: run.screen.label, lines: describeScreen(run.screen, item.role === "exit-watch"), costUSD: null, seconds: null, note: undefined };
    }
    const today = await sameDayReportFor({ owner, db }, item.symbol, true);
    if (!today && budget.left <= 0) return { ...item, status: "skipped", note: "Skipped: no paid research budget left today." };
    if (!today) budget.left--;
    const { run, reused } = today ? { run: today, reused: true } : await deps.research(item.symbol);
    if (!isRated(run)) {
      // The run finished without an analysis (a provider failed). Do not present it as a result or a verdict change.
      return { ...item, status: "failed", reportId: run.id, note: `The analysis did not finish. ${providerFailure(run)?.message ?? ""}`.trim() };
    }
    return rated(run, reused ? "reused" : "researched");
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
  const maxTotal = intEnv(env.MORNING_RESEARCH_MAX, 3, 1, 10);
  const planned = await planMorning(owner, deps);
  const budget: Budget = { left: Math.min(maxTotal, await deps.remainingBudget()) };
  const top = planned.items.filter(i => i.role === "concentrated"), light = planned.items.filter(i => i.role !== "concentrated");
  const items: BriefItem[] = await inBatches(top, 3, i => researchItem(owner, deps, planned, i, budget));
  const notes = [...planned.notes];
  // Quick screens use no AI, so the only reason to skip them is time.
  if (light.length) {
    if (clock() - started > FIRST_PHASE_MS) { notes.push("Quick screens were skipped: the top holdings took too long."); items.push(...light.map(d => ({ ...d, status: "skipped" as const, note: "Skipped: time ran short." }))); }
    else items.push(...await inBatches(light, 3, d => researchItem(owner, deps, planned, d, budget)));
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
    research: async ticker => ({ run: await guardedResearch({ claim: claimResearchSlot, run: () => runResearch(ticker), save: r => saveSnapshotFor({ owner, db }, r), release: releaseResearchSlot, keepUnrated: false }), reused: false }),
    screen: async ticker => ({ run: await guardedResearch({ claim: claimLightSlot, run: () => runResearch(ticker, undefined, "light"), save: r => saveSnapshotFor({ owner, db }, r), release: async () => {}, keepUnrated: false, tier: "light" }), reused: false }),
    quote: async ticker => { try { const m = await providers.market.getMarket(ticker); return m.price && m.price > 0 ? m.price : null; } catch { return null; } },
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
