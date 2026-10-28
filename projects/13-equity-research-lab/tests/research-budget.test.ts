import { describe, expect, it } from "vitest";
import { dailyCap, evaluateBudget, paidReportsSince, reusable, utcDayStart, DEFAULT_DAILY_CAP, PAID_TIER_FILTER } from "../lib/server/research-budget";
import type { ResearchRun } from "../lib/types";

describe("research budget", () => {
  it("parses the cap and falls back to the default for bad values", () => {
    expect(dailyCap({ RESEARCH_DAILY_CAP: "5" })).toBe(5);
    expect(dailyCap({ RESEARCH_DAILY_CAP: "0" })).toBe(0);
    expect(dailyCap({ RESEARCH_DAILY_CAP: "-1" })).toBe(DEFAULT_DAILY_CAP);
    expect(dailyCap({ RESEARCH_DAILY_CAP: "abc" })).toBe(DEFAULT_DAILY_CAP);
    expect(dailyCap({})).toBe(DEFAULT_DAILY_CAP);
  });
  it("blocks when the cap is used up", () => {
    expect(evaluateBudget(3, 5, false)).toMatchObject({ metered: true, remaining: 2 });
    expect(evaluateBudget(5, 5, false).reason).toMatch(/budget reached/);
    expect(evaluateBudget(0, 0, false).reason).toMatch(/budget reached/);
  });
  it("fails closed when usage cannot be counted, unless explicitly unmetered", () => {
    expect(evaluateBudget(null, 5, false).reason).toMatch(/paused/);
    expect(evaluateBudget(null, 5, true).reason).toBeUndefined();
  });
  it("reuses only completed, non-demo reports from the current UTC day", () => {
    const now = new Date("2026-09-30T15:00:00Z");
    const base = { dataMode: "live", score: 60, analyzedAt: "2026-09-30T01:00:00.000Z" } as ResearchRun;
    expect(utcDayStart(now)).toBe("2026-09-30T00:00:00.000Z");
    expect(reusable(base, now)).toBe(true);
    expect(reusable({ ...base, analyzedAt: "2026-09-29T23:59:00.000Z" }, now)).toBe(false);
    expect(reusable({ ...base, score: 0 }, now)).toBe(false);
    expect(reusable({ ...base, score: 0, researchCompletion: { attempted: true } } as ResearchRun, now)).toBe(true);
    expect(reusable({ ...base, dataMode: "demo" } as ResearchRun, now)).toBe(false);
    expect(reusable(undefined, now)).toBe(false);
  });
  it("counts only paid reports toward the floor, not free quick screens", async () => {
    // Fake Supabase table that applies the same filters PostgREST would.
    const rows = [
      { analyzed_at: "2026-10-27T06:00:00.000Z", payload: { tier: "light" } },
      { analyzed_at: "2026-10-27T06:01:00.000Z", payload: { tier: "light" } },
      { analyzed_at: "2026-10-27T07:00:00.000Z", payload: { tier: "deep" } },
      { analyzed_at: "2026-10-27T08:00:00.000Z", payload: {} },
      { analyzed_at: "2026-10-26T23:00:00.000Z", payload: { tier: "deep" } },
    ];
    let orFilter = "";
    const query = {
      since: "",
      select: () => query,
      gte: (_col: string, since: string) => { query.since = since; return query; },
      or: (filter: string) => { orFilter = filter; return query; },
      then: (resolve: (r: { count: number; error: null }) => void) => resolve({
        count: rows.filter(r => r.analyzed_at >= query.since && !(orFilter === PAID_TIER_FILTER && (r.payload as { tier?: string }).tier === "light")).length,
        error: null,
      }),
    };
    expect(await paidReportsSince({ from: () => query }, "2026-10-27T00:00:00.000Z")).toBe(2);
    expect(orFilter).toBe(PAID_TIER_FILTER);
    expect(PAID_TIER_FILTER).toMatch(/tier\.is\.null/);
    expect(PAID_TIER_FILTER).toMatch(/tier\.neq\.light/);
  });
  it("fails closed when the paid count errors", async () => {
    const query: any = { select: () => query, gte: () => query, or: () => query, then: (resolve: (r: unknown) => void) => resolve({ count: null, error: { message: "down" } }) };
    expect(await paidReportsSince({ from: () => query }, "2026-10-27T00:00:00.000Z")).toBeNull();
  });
});
