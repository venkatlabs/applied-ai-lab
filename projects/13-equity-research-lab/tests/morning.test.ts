import { afterEach, describe, expect, it, vi } from "vitest";
import { COMFORT, LIMIT, clusterWeights, dayIndexOf, describeItem, pickDiscovery, sellFraction, summariseBrief, topConcentrated } from "../lib/morning";
import { researchOutcome } from "../lib/outcome";
import { factorKeys } from "../lib/investment";
import { sectorGroups } from "../lib/peer-valuation";
import type { Holdings } from "../lib/holdings";
import type { ResearchRun } from "../lib/types";

const h = (positions: [string, number, number, ("stock" | "fund")?, number?][], total = 1000): Holdings => ({
  version: 1, scope: "t", asOf: "2026-10-22", coverage: "complete", totalValue: total, cashAvailable: 0,
  positions: positions.map(([symbol, shares, price, kind = "stock", averageCost]) => ({ symbol, shares, price, kind, ...(averageCost ? { averageCost } : {}) })),
});

describe("topConcentrated", () => {
  const hold = h([["AMZN", 6, 100, "stock", 50], ["NBIS", 1.5, 100], ["NVDA", 0.9, 100], ["MSFT", 0.2, 100], ["VTI", 5, 100, "fund"]]);
  it("ranks stocks by weight, skips funds, and reports weight and gain", () => {
    const top = topConcentrated(hold, 3);
    expect(top.map(t => t.symbol)).toEqual(["AMZN", "NBIS", "NVDA"]);
    expect(top[0]).toMatchObject({ weight: 0.6, gainPct: 100 });
    expect(top[1].gainPct).toBeNull();
  });
  it("lets pinned symbols lead, even if not held, without duplicating them", () => {
    const top = topConcentrated(hold, 3, ["nvda", "TSLA", "bad symbol"]);
    expect(top.map(t => t.symbol)).toEqual(["NVDA", "TSLA", "AMZN"]);
    expect(top[1].weight).toBe(0);
  });
});

describe("concentration math", () => {
  it("measures the AI-infrastructure cluster and the share to sell for a target weight", () => {
    const c = clusterWeights(h([["NVDA", 1, 100], ["NBIS", 1, 100], ["SMH", 1, 100, "fund"], ["KO", 1, 100]], 1000));
    expect(c[0].weight).toBeCloseTo(0.3, 6); expect(c[0].symbols).toEqual(["NBIS", "NVDA", "SMH"]);
    expect(clusterWeights(h([["KO", 1, 100]]))).toEqual([]);
    expect(sellFraction(0.5, 0.1)).toBeCloseTo(0.8, 6); expect(sellFraction(0.05, 0.1)).toBe(0);
  });
});

describe("pickDiscovery", () => {
  it("spreads picks across different industries, skips excluded names and is deterministic", () => {
    const a = pickDiscovery({ dayIndex: dayIndexOf("2026-10-23"), exclude: new Set(["NVDA"]), count: 2 });
    expect(a).toEqual(pickDiscovery({ dayIndex: dayIndexOf("2026-10-23"), exclude: new Set(["NVDA"]), count: 2 }));
    expect(new Set(a.map(x => x.sector)).size).toBe(2); expect(a.map(x => x.symbol)).not.toContain("NVDA");
  });
  it("rotates through every industry over time and never repeats an excluded name", () => {
    const seen = new Set<string>();
    for (let d = 0; d < sectorGroups().length * 2; d++) for (const p of pickDiscovery({ dayIndex: 20000 + d, exclude: new Set(["AMZN"]), count: 1 })) { seen.add(p.sector); expect(p.symbol).not.toBe("AMZN"); }
    expect(seen.size).toBe(sectorGroups().length);
  });
  it("returns fewer names when nothing is left to suggest", () => {
    const all = new Set(sectorGroups().flatMap(g => g.symbols));
    expect(pickDiscovery({ dayIndex: 1, exclude: all, count: 3 })).toEqual([]);
  });
});

const run = (rating: string): ResearchRun => ({
  id: "r", ticker: "AAA", companyName: "AAA", analyzedAt: "2026-10-23T12:00:00Z", marketAsOf: "2026-10-22", asOfPrice: 100, dataMode: "live", score: 0, highlights: [], risks: [], thesisKillers: [],
  investmentCase: { factors: Object.fromEntries(factorKeys.map(k => [k, { rating, reason: "r", evidenceDate: "2026-10-01", sources: ["https://x.example/a"] }])), valuationBasis: "Peer comparison", valuationBenchmark: "", growthOutlook: "", strongestCounterargument: "", timing: "", changeMind: "" },
}) as unknown as ResearchRun;

describe("describeItem and summariseBrief", () => {
  const o = researchOutcome(run("Mixed"), new Date("2026-10-23T12:00:00Z"));
  it("states the verdict first, then concentration and cluster context in percentages only", () => {
    const lines = describeItem(o, 0.6, "Buy / Add", "Digital platforms", 0.3, true);
    expect(lines[0]).toContain("Hold"); expect(lines.join(" ")).toContain("Changed from Buy / Add");
    expect(lines.join(" ")).toContain(`${(0.6 / LIMIT).toFixed(1)}×`); expect(lines.join(" ")).toContain("83%"); expect(lines.join(" ")).toContain(`${Math.round(COMFORT * 100)}%`);
    expect(lines.join(" ")).toContain("AI-infrastructure"); expect(lines.join(" ")).not.toMatch(/\$\s?\d/);
  });
  it("gives a discovery idea no concentration text", () => {
    const lines = describeItem(o, null, null, "Banks", null, false);
    expect(lines).toHaveLength(1); expect(lines[0]).toContain("Wait");
  });
  it("summarises complete, partial, failed and empty mornings", () => {
    const item = (status: "researched" | "failed" | "skipped" | "reused", changed = false) => ({ symbol: "A", status, changed } as never);
    expect(summariseBrief([item("researched"), item("reused")]).status).toBe("complete");
    expect(summariseBrief([item("researched"), item("failed")]).status).toBe("partial");
    expect(summariseBrief([item("failed")]).status).toBe("failed");
    expect(summariseBrief([]).status).toBe("skipped");
    expect(summariseBrief([item("researched", true)]).summary).toContain("1 verdict change");
  });
});

// ---- orchestration with a fake database ----
const calls: { table: string; op: string; payload?: unknown }[] = [];
let tables: Record<string, unknown[]> = {};
function fakeDb() {
  const builder = (table: string, op = "select", payload?: unknown): any => {
    const b: any = new Proxy({}, { get: (_t, prop: string) => {
      if (prop === "then") return (resolve: (v: unknown) => void) => { if (op !== "select") calls.push({ table, op, payload }); resolve({ data: op === "select" ? tables[table] ?? [] : null, error: null }); };
      if (["insert", "update", "upsert", "delete"].includes(prop)) return (p?: unknown) => builder(table, prop, p);
      if (prop === "maybeSingle" || prop === "single") return () => ({ then: (resolve: (v: unknown) => void) => resolve({ data: (tables[table] ?? [])[0] ?? null, error: null }) });
      return () => b;
    } });
    return b;
  };
  return { from: (t: string) => builder(t) };
}
afterEach(() => { calls.length = 0; tables = {}; vi.resetModules(); vi.doUnmock("../lib/server/supabase"); });

const owner = "o".repeat(64);
const lightRun = (ticker: string, label = "Mixed") => ({ id: `light-${ticker}`, ticker, companyName: ticker, analyzedAt: "2026-10-23T12:00:00Z", asOfPrice: 50, dataMode: "live", tier: "light", score: 0, notes: [], highlights: [], risks: [], thesisKillers: [],
  screen: { label, total: 1, signals: [{ key: "cash", label: "Profit and cash", score: 1, detail: "ok" }, { key: "peers", label: "Multiple versus peers", score: -1, detail: "rich" }], missing: [], note: "" } }) as unknown as ResearchRun;
const extras = (screenLabel = "Mixed") => ({ screen: async (t: string) => ({ run: lightRun(t, screenLabel), reused: false }), quote: async () => null as number | null });
const now = new Date("2026-10-23T12:00:00Z"); // a Friday
const holdings = h([["AMZN", 6, 100], ["NBIS", 1.5, 100], ["NVDA", 0.9, 100], ["MSFT", 0.2, 100]], 1000);
const mkRun = (ticker: string, rating: string, over: Record<string, unknown> = {}) => ({ ...run(rating), id: `id-${ticker}`, ticker, companyName: ticker, cost: { attempts: [], estimatedUSD: 0.4, complete: true, note: "", durationMs: 90000 }, ...over }) as ResearchRun;

describe("runMorningForOwner", () => {
  it("researches the three most concentrated stocks then new names, stores a percent-only brief and alerts on verdict changes", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    tables = { equity_snapshots: [{ ticker: "NVDA", payload: mkRun("NVDA", "Strong", { analyzedAt: "2026-10-01T00:00:00Z", marketAsOf: "2026-09-30" }) }], equity_followed: [], equity_briefs: [] };
    const { runMorningForOwner } = await import("../lib/server/morning-run");
    const asked: string[] = [];
    const brief = await runMorningForOwner(owner, {
      db: fakeDb() as never, now, env: {},
      loadHoldings: async () => ({ holdings, notes: [] }), remainingBudget: async () => 5, ...extras(),
      research: async t => { asked.push(t); return { run: mkRun(t, t === "NVDA" ? "Weak" : "Mixed"), reused: false }; },
    });
    expect(asked.sort()).toEqual(["AMZN", "NBIS", "NVDA"]); // only the top holdings get paid deep reports
    expect(brief.items.filter(i => i.role === "discovery")).toHaveLength(2);
    expect(brief.items.filter(i => i.role !== "concentrated").every(i => i.tier === "light" && i.screenLabel === "Mixed")).toBe(true);
    expect(brief.items.find(i => i.role === "exit-watch")).toMatchObject({ symbol: "MSFT", status: "researched" });
    expect(brief.status).toBe("complete"); expect(brief.cost).toMatchObject({ reports: 3 }); expect(brief.summary).toContain("3 paid deep reports, 3 free screens");
    const nvda = brief.items.find(i => i.symbol === "NVDA")!;
    expect(nvda).toMatchObject({ previousVerdict: "Buy / Add", verdict: "Trim", changed: true });
    expect(brief.concentration!.top3Pct).toBeCloseTo(84, 0); expect(brief.concentration!.flags.join(" ")).toContain("AMZN");
    const stored = JSON.stringify(calls.find(c => c.table === "equity_briefs")!.payload);
    expect(stored).not.toMatch(/\$\s?\d{2,}/); expect(stored).not.toContain("shares");
    expect(calls.find(c => c.table === "equity_alerts")?.payload).toEqual([expect.objectContaining({ symbol: "NVDA", kind: "verdict", direction: "bear" })]);
  });
  it("stays within the research budget, preferring concentrated stocks, and isolates failures", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    tables = { equity_snapshots: [], equity_followed: [] };
    const { runMorningForOwner } = await import("../lib/server/morning-run");
    const asked: string[] = [];
    const brief = await runMorningForOwner(owner, {
      db: fakeDb() as never, now, env: {},
      loadHoldings: async () => ({ holdings, notes: [] }), remainingBudget: async () => 3, ...extras(),
      research: async t => { asked.push(t); if (t === "NBIS") throw new Error("provider down"); return { run: mkRun(t, "Mixed"), reused: false }; },
    });
    expect(asked.sort()).toEqual(["AMZN", "NBIS", "NVDA"]);
    expect(brief.items.find(i => i.symbol === "NBIS")).toMatchObject({ status: "failed", note: "provider down" });
    expect(brief.items.filter(i => i.role === "discovery").every(i => i.status === "researched" && i.tier === "light")).toBe(true); // free screens are not limited by the paid budget
    expect(brief.status).toBe("partial");
  });
  it("falls back to pinned stocks when holdings cannot be read, and does no research with no budget", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    tables = { equity_snapshots: [], equity_followed: [], equity_briefs: [] };
    const { runMorningForOwner } = await import("../lib/server/morning-run");
    const research = vi.fn();
    const brief = await runMorningForOwner(owner, { db: fakeDb() as never, now, env: { MORNING_PINNED: "AMZN,NBIS,NVDA", MORNING_DISCOVERY: "0" },
      loadHoldings: async () => { throw new Error("down"); }, remainingBudget: async () => 0, research, ...extras() });
    expect(research).not.toHaveBeenCalled();
    expect(brief.items.map(i => i.symbol)).toEqual(["AMZN", "NBIS", "NVDA"]); expect(brief.items.every(i => i.status === "skipped")).toBe(true);
    expect(brief.concentration).toBeNull(); expect(brief.notes.join(" ")).toContain("could not be read");
  });
});

describe("runMorningJob gating", () => {
  it("is off unless explicitly enabled, skips weekends, and needs a signed-in owner", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    const { runMorningJob } = await import("../lib/server/morning-run");
    expect((await runMorningJob(now, {})).summary).toContain("off");
    expect((await runMorningJob(new Date("2026-10-24T12:00:00Z"), { MORNING_RESEARCH_ENABLED: "true" })).summary).toContain("weekends");
    tables = { equity_accounts: [] };
    expect((await runMorningJob(now, { MORNING_RESEARCH_ENABLED: "true", OWNER_EMAILS: "me@x.com" })).summary).toContain("sign in once");
    expect(calls.filter(c => c.table === "equity_monitor_runs")).toHaveLength(3);
  });
  it("only prepares for allowlisted accounts", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    tables = { equity_accounts: [{ owner_hash: owner, email: "Me@X.com" }, { owner_hash: "p".repeat(64), email: "other@x.com" }] };
    const { morningOwners } = await import("../lib/server/morning-run");
    expect(await morningOwners(fakeDb() as never, { OWNER_EMAILS: "me@x.com" })).toEqual([owner]);
  });
});

describe("on-demand steps", () => {
  const stubDeps = (research: (t: string) => Promise<{ run: ResearchRun; reused: boolean }>) => ({
    db: fakeDb() as never, now, env: {}, loadHoldings: async () => ({ holdings, notes: [] }), remainingBudget: async () => 5, research, ...extras(),
  });
  it("planning spends nothing and lists every stock as waiting, with weights and the previous verdict", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    tables = { equity_snapshots: [{ ticker: "NVDA", payload: mkRun("NVDA", "Strong", { analyzedAt: "2026-10-01T00:00:00Z", marketAsOf: "2026-09-30" }) }], equity_followed: [] };
    const { planMorning } = await import("../lib/server/morning-run");
    const research = vi.fn();
    const brief = await planMorning(owner, stubDeps(research));
    expect(research).not.toHaveBeenCalled();
    expect(brief.items.every(i => i.status === "pending")).toBe(true);
    expect(brief.items.filter(i => i.role === "concentrated").map(i => i.symbol)).toEqual(["AMZN", "NBIS", "NVDA"]);
    expect(brief.items[0].weightPct).toBe(60); expect(brief.items.find(i => i.symbol === "NVDA")!.previousVerdict).toBe("Buy / Add");
    expect(brief.status).toBe("partial"); expect(brief.summary).toContain("still being prepared");
  });
  it("researching one waiting stock updates only that stock and respects an empty budget", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    tables = { equity_snapshots: [], equity_followed: [] };
    const { planMorning, researchItem, finalizeBrief } = await import("../lib/server/morning-run");
    const deps = stubDeps(async t => ({ run: mkRun(t, "Weak"), reused: false }));
    const brief = await planMorning(owner, deps);
    const amzn = brief.items.find(i => i.symbol === "AMZN")!;
    const done = await researchItem(owner, deps, brief, amzn, { left: 1 });
    expect(done).toMatchObject({ status: "researched", verdict: "Trim", reportId: "id-AMZN" }); expect(done.lines[0]).toContain("Trim");
    const skipped = await researchItem(owner, deps, brief, brief.items.find(i => i.symbol === "NBIS")!, { left: 0 });
    expect(skipped).toMatchObject({ status: "skipped", note: expect.stringContaining("budget") });
    const next = finalizeBrief({ ...brief, items: brief.items.map(i => i.symbol === "AMZN" ? done : i) });
    expect(next.cost.reports).toBe(1); expect(next.items.filter(i => i.status === "pending")).toHaveLength(brief.items.length - 1);
  });
});

describe("/api/morning", () => {
  const post = (body: unknown, origin = "https://lab.test") => new Request("https://lab.test/api/morning", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  it("rejects foreign origins and bad steps, and asks to start first when there is no brief", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    vi.doMock("../lib/server/archive", () => ({ archiveContext: async () => ({ owner, db: fakeDb() }) }));
    tables = { equity_briefs: [] };
    const { POST } = await import("../app/api/morning/route");
    expect((await POST(post({ step: "plan" }, "https://evil.test"))).status).toBe(403);
    expect((await POST(post({ step: "nope" }))).status).toBe(400);
    expect((await POST(post({ step: "research", symbol: "<x>" }))).status).toBe(400);
    expect((await POST(post({ step: "research", symbol: "AMZN" }))).status).toBe(409);
    vi.doUnmock("../lib/server/archive");
  });
  it("plans, then researches one stock and stores the updated brief", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    vi.doMock("../lib/server/archive", () => ({ archiveContext: async () => ({ owner, db: fakeDb() }) }));
    const mod = await vi.importActual<typeof import("../lib/server/morning-run")>("../lib/server/morning-run");
    vi.doMock("../lib/server/morning-run", () => ({ ...mod, morningDepsFor: () => stubDepsFor() }));
    function stubDepsFor() { return { db: fakeDb() as never, now: new Date(), env: {}, loadHoldings: async () => ({ holdings, notes: [] }), remainingBudget: async () => 5, ...extras(), research: async (t: string) => ({ run: mkRun(t, "Mixed"), reused: false }) }; }
    tables = { equity_snapshots: [], equity_followed: [], equity_briefs: [] };
    const { POST } = await import("../app/api/morning/route");
    const planned = await (await POST(post({ step: "plan" }))).json();
    expect(planned.brief.items.length).toBeGreaterThanOrEqual(3);
    tables.equity_briefs = [{ payload: planned.brief }];
    const res = await POST(post({ step: "research", symbol: "AMZN" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brief.items.find((i: { symbol: string }) => i.symbol === "AMZN")).toMatchObject({ status: "researched", verdict: "Hold" });
    expect(calls.filter(c => c.table === "equity_briefs").length).toBeGreaterThanOrEqual(2);
    vi.doUnmock("../lib/server/archive"); vi.doUnmock("../lib/server/morning-run");
  });
});

describe("runs whose analysis did not finish", () => {
  const degraded = (ticker: string) => ({ ...mkRun(ticker, "Mixed"), investmentCase: undefined, score: 0, notes: ["Live evidence loaded, but the AI synthesis failed. No demo score or verdict was substituted.", "Provider note: OpenAI request failed (429)."] }) as unknown as ResearchRun;
  it("are reported as failed with the reason and never as a verdict change", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    tables = { equity_snapshots: [{ ticker: "AMZN", payload: mkRun("AMZN", "Mixed", { analyzedAt: "2026-10-10T00:00:00Z", marketAsOf: "2026-10-09" }) }], equity_followed: [] };
    const { runMorningForOwner } = await import("../lib/server/morning-run");
    const asked: string[] = [];
    const brief = await runMorningForOwner(owner, { db: fakeDb() as never, now, env: {}, loadHoldings: async () => ({ holdings, notes: [] }), remainingBudget: async () => 5, ...extras(),
      research: async t => { asked.push(t); return { run: degraded(t), reused: false }; } });
    expect(asked.sort()).toEqual(["AMZN", "NBIS", "NVDA"]);
    const amzn = brief.items.find(i => i.symbol === "AMZN")!;
    expect(amzn).toMatchObject({ status: "failed", changed: false, verdict: null }); expect(amzn.note).toContain("analysis did not finish"); expect(amzn.note).toContain("OpenAI request failed");
    expect(brief.items.filter(i => i.role !== "concentrated").every(i => i.status === "researched")).toBe(true); // screens still run: they use no AI
    expect(brief.status).toBe("partial");
    expect(calls.some(c => c.table === "equity_alerts")).toBe(false);
  });
});


import { needsDeepRefresh, describeScreen, exitWatchCandidates } from "../lib/morning";
describe("paid deep refresh gate", () => {
  const rep = (daysAgo: number, price = 100) => ({ ...run("Mixed"), analyzedAt: new Date(now.getTime() - daysAgo * 86400000).toISOString(), asOfPrice: price }) as ResearchRun;
  it("pays for a deep report only when none exists, it is old, or the price has moved a lot", () => {
    expect(needsDeepRefresh({ report: undefined, price: 100, now })).toMatchObject({ deep: true, reason: expect.stringContaining("No deep report") });
    expect(needsDeepRefresh({ report: rep(8), price: 100, now })).toMatchObject({ deep: true, reason: expect.stringContaining("8 days old") });
    expect(needsDeepRefresh({ report: rep(2), price: 108, now })).toMatchObject({ deep: true, reason: expect.stringContaining("+8.0%") });
    expect(needsDeepRefresh({ report: rep(2), price: 92, now })).toMatchObject({ deep: true });
    const calm = needsDeepRefresh({ report: rep(2), price: 103, now }); expect(calm.deep).toBe(false); expect(calm.reason).toContain("no new paid report needed");
    expect(needsDeepRefresh({ report: rep(2), price: null, now }).deep).toBe(false);
  });
  it("honours custom limits and a literal every-morning setting", () => {
    expect(needsDeepRefresh({ report: rep(2), price: 100, now, maxAgeDays: 2 }).deep).toBe(true);
    expect(needsDeepRefresh({ report: rep(1), price: 104, now, movePct: 3 }).deep).toBe(true);
    expect(needsDeepRefresh({ report: rep(0), price: 100, now, always: true })).toMatchObject({ deep: true });
  });
});

describe("free tiers in the morning job", () => {
  it("reuses a recent deep report for a top holding and spends nothing", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    const fresh = mkRun("AMZN", "Mixed", { analyzedAt: "2026-10-22T00:00:00Z", marketAsOf: "2026-10-21", asOfPrice: 100 });
    tables = { equity_snapshots: [{ ticker: "AMZN", payload: fresh }], equity_followed: [] };
    const { runMorningForOwner } = await import("../lib/server/morning-run");
    const asked: string[] = [];
    const brief = await runMorningForOwner(owner, { db: fakeDb() as never, now, env: { MORNING_DISCOVERY: "0", MORNING_EXIT_SCAN: "0" }, loadHoldings: async () => ({ holdings, notes: [] }), remainingBudget: async () => 5,
      screen: async t => ({ run: lightRun(t), reused: false }), quote: async t => t === "AMZN" ? 102 : null, research: async t => { asked.push(t); return { run: mkRun(t, "Mixed"), reused: false }; } });
    const amzn = brief.items.find(i => i.symbol === "AMZN")!;
    expect(amzn).toMatchObject({ tier: "reuse", status: "reused", verdict: "Hold", changed: false }); expect(amzn.lines.join(" ")).toContain("no new paid report needed");
    expect(asked.sort()).toEqual(["NBIS", "NVDA"]);
  });
  it("a screen is never a verdict, flags a weak holding for a deep look, and says what it lacks", () => {
    const screen = { label: "Skip for now", total: -3, signals: [{ key: "cash", label: "Profit and cash", score: -1, detail: "" }, { key: "growth", label: "Expected growth", score: 1, detail: "" }], missing: ["a peer comparison"], note: "" } as never;
    const owned = describeScreen(screen, true).join(" "), idea = describeScreen({ ...(screen as object), label: "Worth a deep look" } as never, false).join(" ");
    expect(owned).toContain("not a verdict"); expect(owned).toContain("screens weak"); expect(owned).toContain("a peer comparison");
    expect(idea).toContain("Run a deep report before acting");
  });
  it("rotates which other holding is screened and skips funds and the top holdings", () => {
    const hold = h([["AMZN", 6, 100], ["MSFT", 1, 100], ["KO", 1, 90], ["PG", 1, 80], ["VTI", 5, 100, "fund"]], 2000);
    const exclude = new Set(["AMZN"]);
    expect(exitWatchCandidates(hold, exclude, 0, 2)).toEqual(["MSFT", "KO"]);
    expect(exitWatchCandidates(hold, exclude, 1, 2)).toEqual(["KO", "PG"]);
    expect(exitWatchCandidates(hold, exclude, 2, 5)).toHaveLength(3); expect(exitWatchCandidates(hold, exclude, 0, 0)).toEqual([]);
  });
});
