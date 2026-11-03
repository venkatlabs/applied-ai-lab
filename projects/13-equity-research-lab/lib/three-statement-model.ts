/**
 * Research-only, deterministic three-statement projection.
 * All inputs are explicit; missing filings, debt terms, working-capital assumptions
 * or cash flow data MUST NOT be filled by a language model.
 *
 * USD amounts are in one caller-selected, consistent unit (e.g. millions).
 * This is an illustrative unlevered DCF, not a 12-month price target.
 */
export type ModelAssumptions = {
  revenueGrowth: number[];
  operatingMargin: number[];
  taxRate: number;
  depreciationPctRevenue: number;
  capexPctRevenue: number;
  netWorkingCapitalPctRevenue: number;
  interestRateOnDebt: number;
  discountRate: number;
  terminalGrowth: number;
  /** Required: starting balance sheet must reconcile. */
  starting: {
    year: number;
    revenue: number;
    cash: number;
    otherAssets: number;
    debt: number;
    otherLiabilities: number;
    equity: number;
    netWorkingCapital: number;
    propertyPlantEquipment: number;
    /** Opening PP&E is included in otherAssets, not added to it. */
  };
  sharesOutstanding: number;
  /** Net debt is subtracted from enterprise value. Set explicit zero only if verified. */
};
export type ModelYear = {
  year: number; revenue: number; operatingIncome: number; interestExpense: number;
  pretaxIncome: number; taxes: number; netIncome: number; depreciation: number;
  capitalExpenditure: number; changeInWorkingCapital: number;
  cashFlowFromOperations: number; freeCashFlowToFirm: number;
  cashFlowAfterCapex: number; endingCash: number; endingPpe: number;
  otherAssets: number; totalAssets: number; debt: number; otherLiabilities: number;
  equity: number; balanceSheetDifference: number;
};
export type ModelResult =
  | { available: false; errors: string[] }
  | { available: true; years: ModelYear[]; terminalFreeCashFlow: number; terminalValue: number;
      enterpriseValue: number; equityValue: number; perShareValue: number;
      assumptions: ModelAssumptions; warnings: string[] };

const valid = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const near = (x: number, y: number) => Math.abs(x - y) <= Math.max(0.01, Math.abs(y) * 1e-8);
const inRange = (x: number, lo: number, hi: number) => valid(x) && x >= lo && x <= hi;

export function buildThreeStatementModel(a: ModelAssumptions): ModelResult {
  const errors: string[] = [];
  const s = a.starting;
  if (!s || ![s.year,s.revenue,s.cash,s.otherAssets,s.debt,s.otherLiabilities,s.equity,s.netWorkingCapital,s.propertyPlantEquipment].every(valid))
    return { available: false, errors: ["Complete, finite opening financial statements are required."] };
  if (!Number.isInteger(s.year) || !inRange(s.revenue, 0.000001, Infinity) ||
      ![s.cash,s.otherAssets,s.debt,s.otherLiabilities,s.propertyPlantEquipment].every(x=>x>=0))
    errors.push("Opening year, revenue, cash, assets, liabilities and debt must be valid.");
  if (s.propertyPlantEquipment > s.otherAssets) errors.push("PP&E cannot exceed otherAssets (which includes PP&E).");
  if (s.propertyPlantEquipment + s.netWorkingCapital > s.otherAssets + 1e-9)
    errors.push("Opening PP&E plus net working capital cannot exceed otherAssets.");
  if (!near(s.cash + s.otherAssets, s.debt + s.otherLiabilities + s.equity))
    errors.push("Opening assets must equal liabilities plus equity.");
  const n = a.revenueGrowth?.length ?? 0;
  if (n < 1 || n > 10 || a.operatingMargin?.length !== n) errors.push("Supply 1–10 growth and margin assumptions, one of each per year.");
  if (!(a.revenueGrowth ?? []).every(x => inRange(x, -0.99, 2))) errors.push("Revenue growth must be between -99% and 200%.");
  if (!(a.operatingMargin ?? []).every(x => inRange(x, -1, 1))) errors.push("Operating margins must be between -100% and 100%.");
  if (!inRange(a.taxRate,0,1) || !inRange(a.depreciationPctRevenue,0,1) ||
      !inRange(a.capexPctRevenue,0,2) || !inRange(a.netWorkingCapitalPctRevenue,-1,1) ||
      !inRange(a.interestRateOnDebt,0,1)) errors.push("Missing or invalid operating assumptions.");
  if (!inRange(a.discountRate,0.001,1) || !inRange(a.terminalGrowth,-0.5,0.3) ||
      !(a.discountRate > a.terminalGrowth)) errors.push("Discount rate must exceed terminal growth.");
  if (!inRange(a.sharesOutstanding,0.000001,Infinity)) errors.push("A positive, verified diluted share count is required.");
  if (errors.length) return { available:false, errors };

  let revenue=s.revenue, cash=s.cash, ppe=s.propertyPlantEquipment,
    nwc=s.netWorkingCapital, equity=s.equity;
  const years: ModelYear[]=[];
  let pv=0;
  for (let i=0;i<n;i++) {
    const nextRevenue=revenue*(1+a.revenueGrowth[i]);
    const operatingIncome=nextRevenue*a.operatingMargin[i];
    const interestExpense=s.debt*a.interestRateOnDebt; // debt held flat: no financing forecast invented
    const pretaxIncome=operatingIncome-interestExpense;
    const taxes=Math.max(0,pretaxIncome)*a.taxRate; // no assumed loss carryforward
    const netIncome=pretaxIncome-taxes;
    const depreciation=nextRevenue*a.depreciationPctRevenue;
    const capitalExpenditure=nextRevenue*a.capexPctRevenue;
    const targetNwc=nextRevenue*a.netWorkingCapitalPctRevenue;
    const changeInWorkingCapital=targetNwc-nwc;
    const cashFlowFromOperations=netIncome+depreciation-changeInWorkingCapital;
    const cashFlowAfterCapex=cashFlowFromOperations-capitalExpenditure;
    const freeCashFlowToFirm=operatingIncome*(1-a.taxRate)+depreciation-capitalExpenditure-changeInWorkingCapital;
    cash+=cashFlowAfterCapex;
    ppe+=capitalExpenditure-depreciation;
    equity+=netIncome;
    const otherAssets=s.otherAssets+(ppe-s.propertyPlantEquipment)+(targetNwc-s.netWorkingCapital);
    const totalAssets=cash+otherAssets;
    const balanceSheetDifference=totalAssets-(s.debt+s.otherLiabilities+equity);
    const row: ModelYear={year:s.year+i+1,revenue:nextRevenue,operatingIncome,interestExpense,pretaxIncome,taxes,netIncome,
      depreciation,capitalExpenditure,changeInWorkingCapital,cashFlowFromOperations,freeCashFlowToFirm,
      cashFlowAfterCapex,endingCash:cash,endingPpe:ppe,otherAssets,totalAssets,debt:s.debt,
      otherLiabilities:s.otherLiabilities,equity,balanceSheetDifference};
    years.push(row);
    pv+=freeCashFlowToFirm/Math.pow(1+a.discountRate,i+1);
    revenue=nextRevenue; nwc=targetNwc;
  }
  // Terminal cash flow is rebuilt for the first year after the forecast: revenue grows at the
  // terminal rate, margin, depreciation and capex ratios stay at their final-year values, and
  // working capital is reinvested at the terminal rate, not at the final year's growth rate.
  const last=years[n-1];
  const terminalRevenue=last.revenue*(1+a.terminalGrowth);
  const terminalFcf=terminalRevenue*a.operatingMargin[n-1]*(1-a.taxRate)
    +terminalRevenue*a.depreciationPctRevenue-terminalRevenue*a.capexPctRevenue
    -a.netWorkingCapitalPctRevenue*(terminalRevenue-last.revenue);
  const terminalValue=terminalFcf/(a.discountRate-a.terminalGrowth);
  const enterpriseValue=pv+terminalValue/Math.pow(1+a.discountRate,n);
  const equityValue=enterpriseValue+s.cash-s.debt;
  const warnings:string[]=[
    "Illustrative constant-debt forecast; no dividends, share issuance, buybacks or acquisitions.",
    "Opening cash and debt are applied once in enterprise-to-equity bridge; future net financing is zero.",
    "Terminal cash flow keeps final-year margin, depreciation and capex ratios and reinvests working capital at the terminal growth rate; capex above depreciation in perpetuity is an assumption to review.",
    "No NOL carryforwards, deferred taxes or SBC dilution.",
    "Any negative cash, PP&E, or forecast balance-sheet imbalance requires manual review."
  ];
  if (years.some(y=>y.endingCash<0||y.endingPpe<0||y.otherAssets<0||!near(y.balanceSheetDifference,0)))
    return { available:false, errors:["Projected cash, PP&E or other assets went negative, or the balance sheet did not reconcile; revise assumptions."] };
  if (!(terminalFcf>0) || !valid(enterpriseValue) || !valid(equityValue) || equityValue<=0)
    return { available:false, errors:["Positive, finite terminal free cash flow and equity value are required."] };
  return {available:true,years,terminalFreeCashFlow:terminalFcf,terminalValue,enterpriseValue,equityValue,perShareValue:equityValue/a.sharesOutstanding,assumptions:a,warnings};
}
