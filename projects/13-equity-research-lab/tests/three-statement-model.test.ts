import { describe, it, expect } from "vitest";
import { buildThreeStatementModel, type ModelAssumptions } from "../lib/three-statement-model";

const example: ModelAssumptions = {
  starting: {year:2025,revenue:1000,cash:100,otherAssets:900,debt:200,
    otherLiabilities:200,equity:600,netWorkingCapital:100,propertyPlantEquipment:500},
  revenueGrowth:[0.10,0.10,0.10],operatingMargin:[0.20,0.20,0.20],
  taxRate:0.25,depreciationPctRevenue:0.05,capexPctRevenue:0.07,
  netWorkingCapitalPctRevenue:0.10,interestRateOnDebt:0.05,
  discountRate:0.10,terminalGrowth:0.025,sharesOutstanding:100,
};

describe("three-statement research model",()=>{
  it("reconciles all three statements for each projected year",()=>{
    const m=buildThreeStatementModel(example);
    if (!m.available) throw new Error(m.errors.join(", "));
    expect(m.years).toHaveLength(3);
    for (const y of m.years) {
      expect(y.balanceSheetDifference).toBeCloseTo(0,7);
      expect(y.totalAssets).toBeCloseTo(y.equity+y.debt+y.otherLiabilities,7);
      expect(y.cashFlowAfterCapex).toBeCloseTo(y.netIncome+y.depreciation-y.changeInWorkingCapital-y.capitalExpenditure,7);
      expect(y.freeCashFlowToFirm).toBeCloseTo(y.operatingIncome*(1-example.taxRate)+y.depreciation-y.capitalExpenditure-y.changeInWorkingCapital,7);
    }
    expect(m.perShareValue).toBeGreaterThan(0);
  });
  it("is deterministic and does not depend on market quote",()=>{
    const a=buildThreeStatementModel(example),b=buildThreeStatementModel({...example,starting:{...example.starting}});
    expect(a).toEqual(b);
  });
  it("rejects an opening balance sheet that does not balance",()=>{
    const m=buildThreeStatementModel({...example,starting:{...example.starting,equity:700}});
    expect(m.available).toBe(false);
    if (!m.available) expect(m.errors.join(" ")).toMatch(/Opening assets/);
  });
  it("blocks missing assumptions and invalid discount rates",()=>{
    expect(buildThreeStatementModel({...example,revenueGrowth:[]}).available).toBe(false);
    expect(buildThreeStatementModel({...example,discountRate:0.01}).available).toBe(false);
    expect(buildThreeStatementModel({...example,sharesOutstanding:0}).available).toBe(false);
  });
  it("does not fabricate fair value when forecast free cash flow is negative",()=>{
    const m=buildThreeStatementModel({...example,capexPctRevenue:0.9});
    expect(m.available).toBe(false);
  });
  it("does not double-count debt or cash in valuation bridge",()=>{
    const m=buildThreeStatementModel(example);
    if (!m.available) throw new Error(m.errors.join(", "));
    expect(m.equityValue).toBeCloseTo(m.enterpriseValue+example.starting.cash-example.starting.debt,8);
  });
});
