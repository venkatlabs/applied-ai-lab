import { describe, expect, it } from "vitest";
import { researchOutcome, verdictForScore, latestByTicker } from "../lib/outcome";
import { factorKeys } from "../lib/investment";
import type { ResearchRun } from "../lib/types";

const url = "https://issuer.example/a";
const now = new Date("2026-10-16T12:00:00Z");
const factor = (rating: string, over: object = {}) => ({ rating, reason: `reason ${rating}`, evidenceDate: "2026-10-01", sources: [url], ...over });
const run = (ratings: Record<string, string> = {}, over: Partial<ResearchRun> & Record<string, unknown> = {}) => ({
  id: "r1", ticker: "ABC", companyName: "ABC", analyzedAt: "2026-10-15T00:00:00Z", marketAsOf: "2026-10-14", asOfPrice: 10, dataMode: "live",
  score: 0, highlights: ["h"], risks: ["r"], thesisKillers: ["k"],
  investmentCase: { factors: Object.fromEntries(factorKeys.map(k => [k, factor(ratings[k] ?? "Mixed")])), valuationBasis: "Peer comparison", valuationBenchmark: "", growthOutlook: "", strongestCounterargument: "", timing: "", changeMind: "Revisit if cash burn rises." },
  ...over }) as unknown as ResearchRun;

describe("verdict thresholds", () => {
  it("maps scores to four clear verdicts", () => {
    expect(verdictForScore(85).verdict).toBe("Buy / Add");
    expect(verdictForScore(70).verdict).toBe("Buy / Add");
    expect(verdictForScore(65)).toEqual({ verdict: "Hold", lean: "positive" });
    expect(verdictForScore(50)).toEqual({ verdict: "Hold", lean: "neutral" });
    expect(verdictForScore(45)).toEqual({ verdict: "Hold", lean: "negative" });
    expect(verdictForScore(35).verdict).toBe("Trim");
    expect(verdictForScore(20).verdict).toBe("Sell / Avoid");
  });
});

describe("researchOutcome", () => {
  it("gives a buy view with high confidence when evidence is complete and strong", () => {
    const o = researchOutcome(run(Object.fromEntries(factorKeys.map(k => [k, "Strong"]))), now);
    expect(o).toMatchObject({ verdict: "Buy / Add", score: 70, confidence: "High", method: "six-factor", needsRefresh: false });
    expect(o.reasonsFor.length).toBeGreaterThan(0); expect(o.changeMind).toContain("cash burn");
  });
  it("never withholds a verdict when evidence is missing; it lowers confidence and lists the gaps", () => {
    const ratings = Object.fromEntries(factorKeys.map(k => [k, "Unknown"]));
    const o = researchOutcome(run({ ...ratings, growth: "Strong", cash: "Weak" }, { marketAsOf: "2026-01-01" }), now);
    expect(o.verdict).toBe("Hold"); expect(o.confidence).toBe("Low"); expect(o.score).not.toBeNull();
    expect(o.missing.join(" ")).toContain("recent verified share price"); expect(o.missing.join(" ")).toContain("evidence");
  });
  it("caps unknown valuation below a buy and stale price blocks a buy", () => {
    const strong = Object.fromEntries(factorKeys.map(k => [k, "Very strong"]));
    expect(researchOutcome(run({ ...strong, valuation: "Unknown" }), now)).toMatchObject({ verdict: "Hold", score: 59 });
    const o = researchOutcome(run(strong, { marketAsOf: "2026-08-01" }), now);
    expect(o.verdict).toBe("Hold"); expect(o.missing.join(" ")).toContain("recent price is needed before a buy view");
  });
  it("calls clearly negative evidence a trim or sell", () => {
    expect(researchOutcome(run(Object.fromEntries(factorKeys.map(k => [k, "Weak"]))), now).verdict).toBe("Trim");
    expect(researchOutcome(run(Object.fromEntries(factorKeys.map(k => [k, "Very weak"]))), now)).toMatchObject({ verdict: "Sell / Avoid", score: 10 });
  });
  it("flags reports older than 30 days for refresh and reports their age", () => {
    const o = researchOutcome(run({}, { analyzedAt: "2026-08-01T00:00:00Z", marketAsOf: "2026-07-31" }), now);
    expect(o.needsRefresh).toBe(true); expect(o.ageDays).toBe(76);
  });
  it("derives a low-confidence outcome from older reports and says so", () => {
    const o = researchOutcome(run({}, { investmentCase: undefined, score: 72 }), now);
    expect(o).toMatchObject({ verdict: "Buy / Add", confidence: "Low", method: "legacy" });
    expect(o.headline).toContain("Older-method");
    expect(researchOutcome(run({}, { investmentCase: undefined, score: 0 }), now).verdict).toBe("Not researched");
  });
  it("is explicit when a stock has not been researched or only has demo data", () => {
    expect(researchOutcome(undefined, now)).toMatchObject({ verdict: "Not researched", confidence: null });
    expect(researchOutcome(run({}, { dataMode: "demo" }), now).verdict).toBe("Not researched");
  });
  it("adds the modeled five-case range only when a valid distribution exists", () => {
    const cases = [5, 8, 11, 14, 20].map((price, i) => ({ price, weight: [10, 20, 40, 20, 10][i] }));
    const o = researchOutcome(run({}, { scenarioDistribution: { cases } as never }), now);
    expect(o.bearPrice).toBe(5); expect(o.bullPrice).toBe(20); expect(o.weightedReturnPct).toBeCloseTo(((.5 + 1.6 + 4.4 + 2.8 + 2) / 10 - 1) * 100, 1);
    expect(researchOutcome(run(), now).weightedReturnPct).toBeNull();
  });
  it("picks the newest live report per ticker", () => {
    const a = run({}, { id: "a", analyzedAt: "2026-10-01T00:00:00Z" }), b = run({}, { id: "b", analyzedAt: "2026-10-10T00:00:00Z" }), d = run({}, { id: "d", ticker: "XYZ", dataMode: "demo" });
    const m = latestByTicker([a, b, d]); expect(m.get("ABC")!.id).toBe("b"); expect(m.has("XYZ")).toBe(false);
  });
});

it("tolerates archived reports with missing optional text fields", () => {
  const r = run({}, { highlights: undefined, risks: undefined, thesisKillers: undefined });
  delete (r.investmentCase as unknown as Record<string, unknown>).changeMind;
  expect(researchOutcome(r, now)).toMatchObject({ verdict: "Hold", changeMind: "" });
  expect(researchOutcome(run({}, { investmentCase: undefined, score: 55, highlights: undefined, risks: undefined, thesisKillers: undefined }), now).method).toBe("legacy");
});
