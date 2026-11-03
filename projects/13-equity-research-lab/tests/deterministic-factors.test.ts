import { describe, it, expect } from "vitest";
import { cashRating, growthRating, applyDeterministicFactors } from "../lib/deterministic-factors";
import { factorKeys, singleInvestmentDecision, type InvestmentCase } from "../lib/investment";
import type { ResearchRun } from "../lib/types";

const B = 1e9;
const thesis = (cash = "Strong", growth = "Strong"): InvestmentCase => ({
  factors: Object.fromEntries(factorKeys.map(k => [k, { rating: k === "cash" ? cash : k === "growth" ? growth : "Mixed", reason: `model ${k}`, sources: ["https://x.example/a"], evidenceDate: "2026-09-01" }])) as InvestmentCase["factors"],
  valuationBasis: "Peer comparison", valuationBenchmark: "b", growthOutlook: "", strongestCounterargument: "", timing: "", changeMind: "",
});
const ctxBase = { asOf: "2026-10-30", secUrl: "https://sec.example/facts", annualEnd: "2025-12-31", consensusUrl: "https://fmp.example/estimates" };

describe("cash rating from the annual filing", () => {
  it("rates each profile, including a cash-burning company by its runway", () => {
    expect(cashRating({ revenue: 100 * B, netIncome: 25 * B, freeCashFlow: 20 * B, cash: 30 * B, debt: 10 * B })?.rating).toBe("Very strong");
    expect(cashRating({ revenue: 100 * B, netIncome: 12 * B, freeCashFlow: 7 * B, cash: 5 * B, debt: 20 * B })?.rating).toBe("Strong");
    expect(cashRating({ revenue: 100 * B, netIncome: 5 * B, freeCashFlow: 2 * B, cash: 5 * B, debt: 5 * B })?.rating).toBe("Mixed");
    expect(cashRating({ revenue: 600 * B, netIncome: 30 * B, freeCashFlow: -8 * B, cash: 90 * B, debt: 60 * B })?.rating).toBe("Mixed");
    const burn = cashRating({ revenue: 0.5 * B, netIncome: -1 * B, freeCashFlow: -1.5 * B, cash: 2.4 * B, debt: 1.0 * B });
    expect(burn?.rating).toBe("Weak"); expect(burn?.reason).toContain("1.6 years");
    expect(cashRating({ revenue: 0.5 * B, netIncome: -1 * B, freeCashFlow: -1.5 * B, cash: 0.9 * B, debt: 0.5 * B })?.rating).toBe("Very weak");
    expect(cashRating({ revenue: 1 * B, netIncome: -1 * B, freeCashFlow: -0.2 * B, cash: 0.1 * B, debt: 2 * B })?.rating).toBe("Very weak"); // debt > 3x cash
  });
  it("returns nothing when a required figure is missing, instead of guessing", () => {
    expect(cashRating({ revenue: 100 * B, netIncome: 5 * B })).toBeUndefined();
    expect(cashRating({ netIncome: 5 * B, freeCashFlow: 1 * B })).toBeUndefined();
    expect(cashRating({ revenue: 0, netIncome: 5 * B, freeCashFlow: 1 * B })).toBeUndefined();
  });
  it("says so when the funding runway cannot be measured", () => {
    expect(cashRating({ revenue: 1 * B, netIncome: -1 * B, freeCashFlow: -1 * B })?.reason).toContain("runway cannot be measured");
  });
});

describe("growth rating from consensus", () => {
  it("uses the quick-screen thresholds", () => {
    const r = (g: number) => growthRating(g)?.rating;
    expect([r(0.25), r(0.1), r(0.05), r(0.01), r(-0.02)]).toEqual(["Very strong", "Strong", "Mixed", "Weak", "Very weak"]);
    expect(growthRating(undefined)).toBeUndefined();
  });
});

describe("applying the factors to a report", () => {
  const f = { revenue: 100 * B, netIncome: 25 * B, freeCashFlow: 20 * B, cash: 30 * B, debt: 10 * B };
  it("sets cash and growth in code, cites the filing and consensus, and shows the model's view as unused", () => {
    const out = applyDeterministicFactors(thesis("Weak", "Very weak"), { ...ctxBase, fundamentals: f, consensusGrowth: 0.12 });
    expect(out.factors.cash).toMatchObject({ rating: "Very strong", evidenceDate: "2025-12-31" });
    expect(out.factors.cash.sources[0]).toBe("https://sec.example/facts");
    expect(out.factors.cash.reason).toContain("The model rated this Weak; the rating used is set in code.");
    expect(out.factors.cash.reason).toContain("Model critique: model cash");
    expect(out.factors.growth).toMatchObject({ rating: "Strong", evidenceDate: "2026-10-30" });
    expect(out.factors.growth.sources[0]).toBe("https://fmp.example/estimates");
    expect(out.factors.valuation).toEqual(thesis().factors.valuation); // other factors untouched
  });
  it("gives the same rating whatever the model wrote, so the score cannot flip between runs", () => {
    const ratings = ["Very weak", "Weak", "Mixed", "Strong", "Very strong"];
    const seen = new Set(ratings.flatMap(c => ratings.map(g => {
      const t = applyDeterministicFactors(thesis(c, g), { ...ctxBase, fundamentals: f, consensusGrowth: 0.12 });
      return `${t.factors.cash.rating}|${t.factors.growth.rating}`;
    })));
    expect([...seen]).toEqual(["Very strong|Strong"]);
  });
  it("lowers the score instead of trusting an optimistic model when the filing is weak", () => {
    const run = (cash: string) => ({ ticker: "T", analyzedAt: "2026-10-30T00:00:00Z", marketAsOf: "2026-10-29", asOfPrice: 10, dataMode: "live",
      investmentCase: applyDeterministicFactors(thesis(cash, "Strong"), { ...ctxBase, consensusGrowth: 0.12, fundamentals: { revenue: 0.5 * B, netIncome: -1 * B, freeCashFlow: -1.5 * B, cash: 2.4 * B, debt: 1.0 * B } }) }) as unknown as ResearchRun;
    expect(singleInvestmentDecision(run("Very strong")).score).toBe(singleInvestmentDecision(run("Very weak")).score);
  });
  it("leaves the model's factor alone when the filing is stale or no citable source exists", () => {
    const stale = applyDeterministicFactors(thesis("Weak"), { ...ctxBase, annualEnd: "2024-01-31", fundamentals: f });
    expect(stale.factors.cash.rating).toBe("Weak");
    const noSource = applyDeterministicFactors(thesis("Weak", "Weak"), { ...ctxBase, secUrl: undefined, consensusUrl: undefined, fundamentals: f, consensusGrowth: 0.12 });
    expect([noSource.factors.cash.rating, noSource.factors.growth.rating]).toEqual(["Weak", "Weak"]);
    const noFigures = applyDeterministicFactors(thesis("Weak"), { ...ctxBase, fundamentals: { revenue: 100 * B } });
    expect(noFigures.factors.cash.rating).toBe("Weak");
  });
  it("does not mutate the input thesis", () => {
    const t = thesis("Weak"); const before = JSON.stringify(t);
    applyDeterministicFactors(t, { ...ctxBase, fundamentals: f, consensusGrowth: 0.12 });
    expect(JSON.stringify(t)).toBe(before);
  });
});
