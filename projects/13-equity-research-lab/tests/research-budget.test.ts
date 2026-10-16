import { describe, expect, it } from "vitest";
import { dailyCap, evaluateBudget, reusable, utcDayStart, DEFAULT_DAILY_CAP } from "../lib/server/research-budget";
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
});
