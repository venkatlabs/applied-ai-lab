import { describe, expect, it } from "vitest";
import { adviseHoldings } from "../lib/position-advice";
import { stockActionSummary } from "../lib/action-plan";
import { researchOutcome } from "../lib/outcome";
import { factorKeys } from "../lib/investment";
import type { ResearchRun } from "../lib/types";

const now = new Date("2026-10-21T12:00:00Z");
const holdings = { version: 1 as const, scope: "t", asOf: "2026-10-20", coverage: "complete" as const, totalValue: 100000, cashAvailable: 90000, positions: [{ symbol: "AAA", shares: 10, price: 100, kind: "stock" as const }] };
const run = (rating: string, over: Record<string, unknown> = {}, ratings: Record<string, string> = {}) => ({
  id: "r", ticker: "AAA", companyName: "AAA", analyzedAt: "2026-10-18T00:00:00Z", marketAsOf: "2026-10-17", asOfPrice: 100, dataMode: "live", score: 0, highlights: [], risks: [], thesisKillers: [],
  investmentCase: { factors: Object.fromEntries(factorKeys.map(k => [k, { rating: ratings[k] ?? rating, reason: "r", evidenceDate: "2026-10-01", sources: ["https://x.example/a"] }])), valuationBasis: "Peer comparison", valuationBenchmark: "", growthOutlook: "", strongestCounterargument: "", timing: "", changeMind: "" },
  ...over }) as unknown as ResearchRun;

describe("one outcome model across My stocks, holdings advice and stock actions", () => {
  it("an owned stock with incomplete evidence still gets a verdict-based action, not 'check value first'", () => {
    const r = run("Unknown", {}, { growth: "Strong", cash: "Strong" });
    const [a] = adviseHoldings(holdings, {}, [r], undefined, now);
    expect(researchOutcome(r, now)).toMatchObject({ verdict: "Hold", confidence: "Low" });
    expect(a.action).toBe("Hold"); expect(a.reasons.join(" ")).toContain("Hold");
  });
  it("a clearly negative report on an owned stock leads to a trim or sell review", () => {
    expect(adviseHoldings(holdings, {}, [run("Weak")], undefined, now)[0].action).toBe("Trim candidate");
    expect(adviseHoldings(holdings, {}, [run("Very weak")], undefined, now)[0].action).toBe("Review selling");
  });
  it("a 60-day-old report still informs the verdict but cannot create a buy candidate", () => {
    const old = run("Very strong", { analyzedAt: "2026-08-22T00:00:00Z", marketAsOf: "2026-08-21" });
    const [a] = adviseHoldings(holdings, {}, [old], undefined, now);
    expect(a.action).not.toBe("Add candidate");
    const s = stockActionSummary(old, { ...holdings, positions: [] }, undefined, now);
    expect(s.label).toBe("RESEARCH FIRST");
  });
  it("a fresh, complete, strong report on a stock you do not own is a buy candidate with its confidence in the reasons", () => {
    const s = stockActionSummary(run("Very strong"), { ...holdings, positions: [] }, undefined, now);
    expect(s.label).toBe("BUY / ADD CANDIDATE"); expect(s.reasons.join(" ")).toContain("confidence");
  });
  it("labels a new position from a negative report as do not initiate and a hold as wait", () => {
    expect(stockActionSummary(run("Weak"), null, undefined, now).label).toBe("AVOID / DO NOT INITIATE");
    expect(stockActionSummary(run("Mixed"), null, undefined, now).label).toBe("WAIT / WATCH");
  });
});
