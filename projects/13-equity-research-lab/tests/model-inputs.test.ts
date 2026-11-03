import { describe, it, expect } from "vitest";
import { buildModelInputs } from "../lib/model-inputs";
import { buildThreeStatementModel } from "../lib/three-statement-model";

const FILED = "2026-02-01";
const inst = (val: number, over: object = {}) => ({ units: { USD: [{ val, form: "10-K", end: "2025-12-31", filed: FILED, accn: "0000000001-26-000001", ...over }] } });
const span = (val: number, over: object = {}) => inst(val, { start: "2025-01-01", ...over });
const priorRev = (val: number) => ({ val, form: "10-K", start: "2024-01-01", end: "2024-12-31", filed: "2025-02-01" });

// Millions of dollars written out in full dollars, as SEC reports them.
const M = 1e6;
function facts(over: Record<string, unknown> = {}, drop: string[] = []) {
  const gaap: Record<string, unknown> = {
    Assets: inst(1000 * M), Liabilities: inst(400 * M),
    CashAndCashEquivalentsAtCarryingValue: inst(100 * M), ShortTermInvestments: inst(50 * M),
    PropertyPlantAndEquipmentNet: inst(500 * M),
    AssetsCurrent: inst(300 * M), LiabilitiesCurrent: inst(150 * M),
    LongTermDebt: inst(180 * M), LongTermDebtCurrent: inst(30 * M), ShortTermBorrowings: inst(20 * M),
    RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [
      { val: 1000 * M, form: "10-K", start: "2025-01-01", end: "2025-12-31", filed: FILED, accn: "0000000001-26-000001" }, priorRev(900 * M)] } },
    OperatingIncomeLoss: span(200 * M), DepreciationDepletionAndAmortization: span(50 * M),
    PaymentsToAcquirePropertyPlantAndEquipment: span(70 * M),
    IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest: span(180 * M),
    IncomeTaxExpenseBenefit: span(45 * M), InterestExpense: span(10 * M),
    WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [{ val: 100 * M, form: "10-K", start: "2025-01-01", end: "2025-12-31", filed: FILED }] } },
    StockholdersEquity: inst(600 * M),
    ...over,
  };
  for (const d of drop) delete gaap[d];
  return { entityName: "Synthetic Co", facts: { "us-gaap": gaap } };
}

describe("model inputs from SEC company facts", () => {
  it("builds a reconciled opening balance sheet in USD millions with provenance", () => {
    const r = buildModelInputs(facts(), { asOf: "2026-03-01" });
    if (!r.available) throw new Error(r.reasons.join("; "));
    const s = r.starting;
    // cash 100 + investments 50; debt 180 (total, includes current) + short-term 20.
    expect(s).toMatchObject({ year: 2025, revenue: 1000, cash: 150, debt: 200, equity: 600, propertyPlantEquipment: 500 });
    expect(s.otherAssets).toBeCloseTo(850, 9);            // 1000 - 150
    expect(s.otherLiabilities).toBeCloseTo(200, 9);       // 400 - 200
    expect(s.cash + s.otherAssets).toBeCloseTo(s.debt + s.otherLiabilities + s.equity, 9);
    // (300 - 150) - (150 - (30 + 20)) = 50
    expect(s.netWorkingCapital).toBeCloseTo(50, 9);
    expect(r.sharesOutstanding).toBe(100);
    expect(r.balanceSheetDate).toBe("2025-12-31");
    expect(r.provenance.find((p) => p.item === "Total assets")).toMatchObject({ tag: "Assets", form: "10-K", accession: "0000000001-26-000001" });
  });

  it("returns same-year ratios as reference, including growth from the prior year", () => {
    const r = buildModelInputs(facts(), { asOf: "2026-03-01" });
    if (!r.available) throw new Error(r.reasons.join("; "));
    expect(r.historical.operatingMargin).toBeCloseTo(0.2, 9);
    expect(r.historical.depreciationPctRevenue).toBeCloseTo(0.05, 9);
    expect(r.historical.capexPctRevenue).toBeCloseTo(0.07, 9);
    expect(r.historical.taxRate).toBeCloseTo(0.25, 9);
    expect(r.historical.interestRateOnDebt).toBeCloseTo(0.05, 9);
    expect(r.historical.revenueGrowth).toBeCloseTo(1000 / 900 - 1, 9);
  });

  it("feeds the model, which reconciles and prices from filed numbers plus caller assumptions", () => {
    const r = buildModelInputs(facts(), { asOf: "2026-03-01" });
    if (!r.available) throw new Error(r.reasons.join("; "));
    const m = buildThreeStatementModel({
      starting: r.starting, sharesOutstanding: r.sharesOutstanding,
      revenueGrowth: [0.08, 0.07, 0.06], operatingMargin: [0.2, 0.2, 0.2], taxRate: 0.25,
      depreciationPctRevenue: 0.05, capexPctRevenue: 0.06, netWorkingCapitalPctRevenue: 0.05,
      interestRateOnDebt: 0.05, discountRate: 0.09, terminalGrowth: 0.025,
    });
    if (!m.available) throw new Error(m.errors.join("; "));
    for (const y of m.years) expect(y.balanceSheetDifference).toBeCloseTo(0, 6);
    expect(m.perShareValue).toBeGreaterThan(0);
  });

  it("lists every missing opening input and builds nothing", () => {
    const r = buildModelInputs(facts({}, ["PropertyPlantAndEquipmentNet", "AssetsCurrent", "WeightedAverageNumberOfDilutedSharesOutstanding"]), { asOf: "2026-03-01" });
    expect(r.available).toBe(false);
    if (!r.available) {
      expect(r.reasons.join(" ")).toMatch(/Property, plant and equipment/);
      expect(r.reasons.join(" ")).toMatch(/Current assets/);
      expect(r.reasons.join(" ")).toMatch(/Diluted shares/);
    }
  });

  it("does not fall back to an older balance sheet when the newest one is incomplete", () => {
    const older = { val: 900 * M, form: "10-K", end: "2024-12-31", filed: "2025-02-01" };
    const r = buildModelInputs(facts({
      Assets: { units: { USD: [older, { val: 1000 * M, form: "10-K", end: "2025-12-31", filed: FILED }] } },
      PropertyPlantAndEquipmentNet: { units: { USD: [{ val: 400 * M, form: "10-K", end: "2024-12-31", filed: "2025-02-01" }] } },
    }), { asOf: "2026-03-01" });
    expect(r.available).toBe(false);
  });

  it("requires debt to be reported or explicitly confirmed absent", () => {
    const noDebt = facts({}, ["LongTermDebt", "LongTermDebtCurrent", "ShortTermBorrowings"]);
    const blocked = buildModelInputs(noDebt, { asOf: "2026-03-01" });
    expect(blocked.available).toBe(false);
    const confirmed = buildModelInputs(noDebt, { asOf: "2026-03-01", confirmNoDebt: true });
    if (!confirmed.available) throw new Error(confirmed.reasons.join("; "));
    expect(confirmed.starting.debt).toBe(0);
  });

  it("ignores quarterly filings and facts from other balance-sheet dates", () => {
    const r = buildModelInputs(facts({ Assets: { units: { USD: [
      { val: 1000 * M, form: "10-K", end: "2025-12-31", filed: FILED },
      { val: 5000 * M, form: "10-Q", end: "2026-03-31", filed: "2026-05-01" }] } } }), { asOf: "2026-03-01" });
    if (!r.available) throw new Error(r.reasons.join("; "));
    expect(r.balanceSheetDate).toBe("2025-12-31");
    expect(r.starting.cash + r.starting.otherAssets).toBeCloseTo(1000, 9);
  });

  it("refuses banks and insurers, stale balance sheets and empty data", () => {
    expect(buildModelInputs(facts({ Deposits: inst(1) }), { asOf: "2026-03-01" }).available).toBe(false);
    expect(buildModelInputs(facts(), { asOf: "2028-01-01" }).available).toBe(false);
    expect(buildModelInputs(undefined).available).toBe(false);
    expect(buildModelInputs({ facts: { "us-gaap": {} } }).available).toBe(false);
  });

  it("flags derived equity that disagrees with reported equity", () => {
    const r = buildModelInputs(facts({ StockholdersEquity: inst(450 * M) }), { asOf: "2026-03-01" });
    if (!r.available) throw new Error(r.reasons.join("; "));
    expect(r.warnings.join(" ")).toMatch(/differs from reported equity/);
  });

  it("lets a loss-making company load while the model withholds the value", () => {
    const r = buildModelInputs(facts({ OperatingIncomeLoss: span(-300 * M) }), { asOf: "2026-03-01" });
    if (!r.available) throw new Error(r.reasons.join("; "));
    const m = buildThreeStatementModel({
      starting: r.starting, sharesOutstanding: r.sharesOutstanding,
      revenueGrowth: [0.3, 0.3, 0.3], operatingMargin: [-0.3, -0.2, -0.1], taxRate: 0.25,
      depreciationPctRevenue: 0.05, capexPctRevenue: 0.2, netWorkingCapitalPctRevenue: 0.05,
      interestRateOnDebt: 0.05, discountRate: 0.1, terminalGrowth: 0.025,
    });
    expect(m.available).toBe(false);
  });
});
