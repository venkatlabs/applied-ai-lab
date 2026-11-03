import { describe, it, expect, vi } from "vitest";
import { loadModelInputs } from "../lib/server/model-inputs-loader";

const M = 1e6;
const inst = (val: number) => ({ units: { USD: [{ val, form: "10-K", end: "2025-12-31", filed: "2026-02-01", accn: "0000000001-26-000001" }] } });
const span = (val: number) => ({ units: { USD: [{ val, form: "10-K", start: "2025-01-01", end: "2025-12-31", filed: "2026-02-01" }] } });
const facts = {
  entityName: "Synthetic Co",
  facts: { "us-gaap": {
    Assets: inst(1000 * M), Liabilities: inst(400 * M), CashAndCashEquivalentsAtCarryingValue: inst(100 * M),
    PropertyPlantAndEquipmentNet: inst(500 * M), AssetsCurrent: inst(300 * M), LiabilitiesCurrent: inst(150 * M),
    LongTermDebt: inst(200 * M), RevenueFromContractWithCustomerExcludingAssessedTax: span(1000 * M),
    WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [{ val: 100 * M, form: "10-K", start: "2025-01-01", end: "2025-12-31", filed: "2026-02-01" }] } },
  } },
};

describe("model inputs loader", () => {
  it("fetches facts for the normalized ticker and builds the opening statements", async () => {
    const source = { getCompanyFacts: vi.fn(async () => facts) };
    const r = await loadModelInputs(" amzn ", source, { asOf: "2026-03-01" });
    expect(source.getCompanyFacts).toHaveBeenCalledWith("AMZN");
    expect(r.ticker).toBe("AMZN");
    if (!r.available) throw new Error(r.reasons.join("; "));
    expect(r.starting.cash + r.starting.otherAssets).toBeCloseTo(r.starting.debt + r.starting.otherLiabilities + r.starting.equity, 9);
  });

  it("returns the loader's reasons when the facts are incomplete", async () => {
    const thin = { facts: { "us-gaap": { ...facts.facts["us-gaap"], PropertyPlantAndEquipmentNet: undefined } } };
    delete (thin.facts["us-gaap"] as Record<string, unknown>).PropertyPlantAndEquipmentNet;
    const r = await loadModelInputs("TEST", { getCompanyFacts: async () => thin }, { asOf: "2026-03-01" });
    expect(r.available).toBe(false);
    if (!r.available) expect(r.reasons.join(" ")).toMatch(/Property, plant and equipment/);
  });

  it("reports a failed SEC call instead of throwing, and does not look like a debt-free company", async () => {
    const r = await loadModelInputs("TEST", { getCompanyFacts: async () => { throw new Error("SEC companyfacts failed: 503"); } }, { confirmNoDebt: true });
    expect(r.available).toBe(false);
    if (!r.available) expect(r.reasons[0]).toMatch(/could not be retrieved for TEST: SEC companyfacts failed: 503/);
  });

  it("rejects invalid tickers before any network call", async () => {
    const source = { getCompanyFacts: vi.fn(async () => facts) };
    for (const bad of ["", "1ABC", "A B", "../etc", "TOOLONGTICKERS"]) {
      const r = await loadModelInputs(bad, source);
      expect(r.available).toBe(false);
    }
    expect(source.getCompanyFacts).not.toHaveBeenCalled();
  });

  it("accepts class-share tickers such as BRK-B", async () => {
    const source = { getCompanyFacts: vi.fn(async () => facts) };
    await loadModelInputs("brk-b", source, { asOf: "2026-03-01" });
    expect(source.getCompanyFacts).toHaveBeenCalledWith("BRK-B");
  });
});
