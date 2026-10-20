import { afterEach, describe, expect, it, vi } from "vitest";
import { cronAuthorized } from "../lib/server/cron";

const calls: { table: string; op: string; payload?: unknown }[] = [];
let tables: Record<string, unknown[]> = {};
function fakeDb() {
  const builder = (table: string, op = "select", payload?: unknown): any => {
    const b: any = new Proxy({}, { get: (_t, prop: string) => {
      if (prop === "then") return (resolve: (v: unknown) => void) => { if (op !== "select") calls.push({ table, op, payload }); resolve({ data: op === "select" ? tables[table] ?? [] : null, error: null }); };
      if (["insert", "update", "upsert", "delete"].includes(prop)) return (p?: unknown) => builder(table, prop, p);
      if (prop === "single" || prop === "maybeSingle") return async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
      return () => b;
    } });
    return b;
  };
  return { from: (t: string) => builder(t) };
}
afterEach(() => { calls.length = 0; tables = {}; vi.resetModules(); vi.doUnmock("../lib/server/supabase"); });

describe("cron authorization", () => {
  const req = (h?: string) => new Request("https://lab.test/api/cron/monitor", { headers: h ? { authorization: h } : {} });
  it("fails closed without a long enough secret and checks the bearer token exactly", () => {
    expect(cronAuthorized(req("Bearer x"), {})).toBe(false);
    expect(cronAuthorized(req("Bearer short"), { CRON_SECRET: "short" })).toBe(false);
    const env = { CRON_SECRET: "s".repeat(24) };
    expect(cronAuthorized(req(`Bearer ${"s".repeat(24)}`), env)).toBe(true);
    expect(cronAuthorized(req(`Bearer ${"s".repeat(23)}x`), env)).toBe(false);
    expect(cronAuthorized(req(), env)).toBe(false);
    expect(cronAuthorized(req(`Basic ${"s".repeat(24)}`), env)).toBe(false);
  });
  it("is the only gate on /api/cron routes, which reject without the secret", async () => {
    vi.stubEnv("CRON_SECRET", "s".repeat(24));
    const { GET } = await import("../app/api/cron/monitor/route");
    expect((await GET(req())).status).toBe(401);
    vi.unstubAllEnvs();
    const { GET: digest } = await import("../app/api/cron/digest/route");
    expect((await digest(req("Bearer anything"))).status).toBe(401);
  });
});

describe("runDailyMonitor", () => {
  it("prices each symbol once, applies trigger changes and alerts, and records the run", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    const owner = "o".repeat(64);
    tables = {
      equity_followed: [{ owner_hash: owner, symbol: "ABC" }, { owner_hash: "p".repeat(64), symbol: "ABC" }],
      equity_triggers: [{ owner_hash: owner, id: "11111111-1111-1111-1111-111111111111", symbol: "ABC", kind: "kill", text: "Falls under eighty", metric: "price_below", threshold: "80", due: null, status: "armed", source: "user", report_id: null, evidence: "", created_at: "x", updated_at: "x" }],
    };
    const { runDailyMonitor } = await import("../lib/server/monitor-run");
    const fetchPrice = vi.fn(async () => ({ price: 70, date: "2026-10-20" }));
    const result = await runDailyMonitor(new Date("2026-10-20T21:30:00Z"), fetchPrice);
    expect(fetchPrice).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, usage: { symbols: 1, priced: 1, updates: 1, alerts: 1 } });
    expect(calls.filter(c => c.table === "equity_triggers" && c.op === "update")[0].payload).toMatchObject({ status: "tripped" });
    expect(calls.find(c => c.table === "equity_alerts")?.payload).toEqual([expect.objectContaining({ symbol: "ABC", direction: "bear" })]);
    expect(calls.find(c => c.table === "equity_monitor_runs")?.payload).toMatchObject({ kind: "daily", ok: true });
  });
  it("reports failure when storage is unavailable and never invents a price", async () => {
    vi.doMock("../lib/server/supabase", () => ({ database: () => null }));
    const { runDailyMonitor } = await import("../lib/server/monitor-run");
    expect(await runDailyMonitor(new Date(), vi.fn())).toMatchObject({ ok: false });
    vi.doMock("../lib/server/supabase", () => ({ database: () => fakeDb() }));
    vi.resetModules();
    tables = { equity_followed: [{ owner_hash: "o".repeat(64), symbol: "ABC" }] };
    const m = await import("../lib/server/monitor-run");
    const r = await m.runDailyMonitor(new Date("2026-10-20T21:30:00Z"), async () => undefined);
    expect(r.usage).toMatchObject({ priced: 0, failed: 1, alerts: 0 });
    expect(calls.some(c => c.table === "equity_alerts")).toBe(false);
  });
});

describe("trigger store goalpost handling", () => {
  it("requires a reason to loosen a kill trigger and logs it as a goalpost move with an alert", async () => {
    const owner = "o".repeat(64), id = "11111111-1111-1111-1111-111111111111";
    vi.doMock("../lib/server/archive", () => ({ archiveContext: async () => ({ owner, db: fakeDb() }), latestReports: async () => ({}) }));
    tables = { equity_triggers: [{ id, symbol: "ABC", kind: "kill", text: "Falls under eighty", metric: "price_below", threshold: "80", due: null, status: "armed", source: "user", report_id: null, evidence: "", created_at: "x", updated_at: "x" }] };
    const { editTrigger, removeTrigger } = await import("../lib/server/triggers-store");
    await expect(editTrigger(id, { threshold: 60 })).rejects.toMatchObject({ code: "goalpost-reason-required", status: 409 });
    expect(calls.some(c => c.table === "equity_trigger_log")).toBe(false);
    await editTrigger(id, { threshold: 60, reason: "Thesis horizon is longer than I thought" });
    expect(calls.find(c => c.table === "equity_trigger_log")?.payload).toMatchObject({ goalpost: true, change: "edited" });
    expect(calls.find(c => c.table === "equity_alerts")?.payload).toMatchObject({ headline: expect.stringContaining("goalpost") });
    await expect(removeTrigger(id, "")).rejects.toMatchObject({ code: "goalpost-reason-required" });
    await editTrigger(id, { threshold: 90 }); // tightening needs no reason
    vi.doUnmock("../lib/server/archive");
  });
});
