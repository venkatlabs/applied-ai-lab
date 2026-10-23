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
      return () => b;
    } });
    return b;
  };
  return { from: (t: string) => builder(t) };
}
afterEach(() => { calls.length = 0; tables = {}; vi.resetModules(); vi.doUnmock("../lib/server/supabase"); });

const owner = "o".repeat(64);
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
      loadHoldings: async () => ({ holdings, notes: [] }), remainingBudget: async () => 5,
      research: async t => { asked.push(t); return { run: mkRun(t, t === "NVDA" ? "Weak" : "Mixed"), reused: false }; },
    });
    expect(asked.slice(0, 3).sort()).toEqual(["AMZN", "NBIS", "NVDA"]); expect(asked).toHaveLength(5);
    expect(brief.items.filter(i => i.role === "discovery")).toHaveLength(2);
    expect(brief.status).toBe("complete"); expect(brief.cost).toMatchObject({ reports: 5 });
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
      loadHoldings: async () => ({ holdings, notes: [] }), remainingBudget: async () => 3,
      research: async t => { asked.push(t); if (t === "NBIS") throw new Error("provider down"); return { run: mkRun(t, "Mixed"), reused: false }; },
    });
    expect(asked.sort()).toEqual(["AMZN", "NBIS", "NVDA"]);
    expect(brief.items.find(i => i.symbol === "NBIS")).toMatchObject({ status: "failed", note: "provider down" });
    expect(brief.items.filter(i => i.role === "discovery").every(i => i.status === "skipped")).toBe(true);
    expect(brief.status).toBe("partial");
  });
  it("falls back to pinned stocks when holdings cannot be read, and does no research with no budget", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    tables = { equity_snapshots: [], equity_followed: [], equity_briefs: [] };
    const { runMorningForOwner } = await import("../lib/server/morning-run");
    const research = vi.fn();
    const brief = await runMorningForOwner(owner, { db: fakeDb() as never, now, env: { MORNING_PINNED: "AMZN,NBIS,NVDA", MORNING_DISCOVERY: "0" },
      loadHoldings: async () => { throw new Error("down"); }, remainingBudget: async () => 0, research });
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
