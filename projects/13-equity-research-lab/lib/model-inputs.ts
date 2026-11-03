import type { ModelAssumptions } from "./three-statement-model";

/**
 * Builds the opening statements for the three-statement model from raw SEC companyfacts.
 * All-or-nothing: every opening input must come from one annual filing and one balance-sheet
 * date. A missing input makes the result unavailable and names it; nothing is estimated here
 * and nothing is filled by a language model. Forecast assumptions stay with the caller.
 * Amounts are USD millions and shares are millions, so per-share values come out in dollars.
 */
type Fact = { val?: number; form?: string; filed?: string; start?: string; end?: string; accn?: string };
export type Provenance = { item: string; tag: string; value: number; end: string; filed: string; form: string; accession?: string };
export type HistoricalRatios = Partial<{
  revenueGrowth: number; operatingMargin: number; taxRate: number; depreciationPctRevenue: number;
  capexPctRevenue: number; netWorkingCapitalPctRevenue: number; interestRateOnDebt: number;
}>;
export type ModelInputsResult =
  | { available: false; reasons: string[] }
  | {
      available: true; unit: "USD millions"; balanceSheetDate: string; filedAt: string; form: string;
      starting: ModelAssumptions["starting"]; sharesOutstanding: number;
      /** Reference only: the same fiscal year's reported ratios, not a forecast. */
      historical: HistoricalRatios; provenance: Provenance[]; warnings: string[];
    };

const ANNUAL = ["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"];
const MILLION = 1e6;
const days = (f: Fact) => (f.start && f.end ? (Date.parse(f.end) - Date.parse(f.start)) / 86400000 : undefined);
const ok = (f: Fact): f is Fact & { val: number; end: string; filed: string; form: string } =>
  typeof f.val === "number" && Number.isFinite(f.val) && !!f.end && !!f.filed && ANNUAL.includes(f.form ?? "");
const later = (a: Fact, b: Fact) => (String(b.filed).localeCompare(String(a.filed)) > 0 ? b : a);

export function buildModelInputs(companyFacts: unknown, opts: { confirmNoDebt?: boolean; asOf?: string } = {}): ModelInputsResult {
  const cf = companyFacts as { facts?: Record<string, Record<string, { units?: Record<string, Fact[]> }>> } | undefined;
  const gaap = cf?.facts?.["us-gaap"] ?? {};
  if (!cf || !Object.keys(gaap).length) return { available: false, reasons: ["No us-gaap company facts were available for this ticker."] };
  if (gaap.Deposits || gaap.InterestBearingDepositLiabilities || gaap.LiabilityForFuturePolicyBenefits || gaap.PolicyholderBenefitsAndClaimsIncurredNet)
    return { available: false, reasons: ["Banks and insurers need a sector-specific model; the corporate DCF is not applicable."] };

  const units = (tag: string, unit = "USD") => (gaap[tag]?.units?.[unit] ?? []) as Fact[];
  const instantAt = (tag: string, end: string) =>
    units(tag).filter((f) => ok(f) && !f.start && f.end === end).reduce<Fact | undefined>((m, f) => (m ? later(m, f) : f), undefined) as (Fact & { val: number; end: string; filed: string; form: string }) | undefined;
  const durationAt = (tag: string, end: string, unit = "USD") =>
    units(tag, unit).filter((f) => ok(f) && f.end === end && (days(f) ?? 0) >= 300 && (days(f) ?? 0) <= 430)
      .reduce<Fact | undefined>((m, f) => (m ? later(m, f) : f), undefined) as (Fact & { val: number; end: string; filed: string; form: string }) | undefined;

  // The newest annual balance sheet is the only one allowed; an older one is never substituted.
  const assetDates = units("Assets").filter((f) => ok(f) && !f.start).map((f) => f.end as string).sort();
  const end = assetDates[assetDates.length - 1];
  if (!end) return { available: false, reasons: ["No annual (10-K, 20-F or 40-F) balance sheet with total assets was found."] };
  const asOf = Date.parse(opts.asOf ?? new Date().toISOString());
  if (asOf - Date.parse(end) > 550 * 86400000) return { available: false, reasons: [`Newest annual balance sheet (${end}) is more than 18 months old.`] };

  const provenance: Provenance[] = [];
  const reasons: string[] = [];
  const warnings: string[] = [];
  const take = (item: string, tags: string[], get: (tag: string) => (Fact & { val: number; end: string; filed: string; form: string }) | undefined, required = true) => {
    for (const tag of tags) {
      const f = get(tag);
      if (f) { provenance.push({ item, tag, value: f.val, end: f.end, filed: f.filed, form: f.form, accession: f.accn }); return f.val; }
    }
    if (required) reasons.push(`${item} (${tags[0]}) is not reported for ${end}.`);
    return undefined;
  };
  const inst = (item: string, tags: string[], required = true) => take(item, tags, (t) => instantAt(t, end), required);
  const dur = (item: string, tags: string[], required = true) => take(item, tags, (t) => durationAt(t, end), required);

  const assets = inst("Total assets", ["Assets"]);
  const liabilities = inst("Total liabilities", ["Liabilities"]);
  const cashOnly = inst("Cash and equivalents", ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"]);
  const shortInvest = inst("Short-term investments", ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"], false);
  const ppe = inst("Property, plant and equipment, net", ["PropertyPlantAndEquipmentNet"]);
  const currentAssets = inst("Current assets", ["AssetsCurrent"]);
  const currentLiabilities = inst("Current liabilities", ["LiabilitiesCurrent"]);
  const revenue = dur("Annual revenue", ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"]);
  const shares = take("Diluted shares", ["WeightedAverageNumberOfDilutedSharesOutstanding"], (t) => durationAt(t, end, "shares"));

  const ltdTotal = inst("Long-term debt", ["LongTermDebt"], false);
  const ltdNon = ltdTotal == null ? inst("Long-term debt, noncurrent", ["LongTermDebtNoncurrent"], false) : undefined;
  const ltdCur = inst("Current portion of long-term debt", ["LongTermDebtCurrent"], false);
  const stBorrow = inst("Short-term borrowings", ["ShortTermBorrowings"], false);
  const paper = inst("Commercial paper", ["CommercialPaper"], false);
  const anyDebt = [ltdTotal, ltdNon, ltdCur, stBorrow, paper].some((x) => x != null);
  if (!anyDebt && !opts.confirmNoDebt) reasons.push(`No debt tags are reported for ${end}; confirm the company is debt-free before running the model.`);
  const debt = (ltdTotal ?? ((ltdNon ?? 0) + (ltdCur ?? 0))) + (stBorrow ?? 0) + (paper ?? 0);
  const currentDebt = (ltdCur ?? 0) + (stBorrow ?? 0) + (paper ?? 0);

  if (reasons.length || assets == null || liabilities == null || cashOnly == null || ppe == null || currentAssets == null || currentLiabilities == null || revenue == null || shares == null)
    return { available: false, reasons };

  const cash = cashOnly + (shortInvest ?? 0);
  const equity = assets - liabilities;
  const reportedEquity = instantAt("StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest", end)?.val ?? instantAt("StockholdersEquity", end)?.val;
  if (reportedEquity != null && Math.abs(reportedEquity - equity) > Math.abs(equity) * 0.01)
    warnings.push("Equity is derived as assets minus liabilities and differs from reported equity by more than 1% (for example redeemable noncontrolling interests); review.");
  const nwc = (currentAssets - cash) - (currentLiabilities - currentDebt);
  const filing = provenance.find((p) => p.item === "Total assets")!;

  const starting = {
    year: Number(end.slice(0, 4)), revenue: revenue / MILLION, cash: cash / MILLION, otherAssets: (assets - cash) / MILLION,
    debt: debt / MILLION, otherLiabilities: (liabilities - debt) / MILLION, equity: equity / MILLION,
    netWorkingCapital: nwc / MILLION, propertyPlantEquipment: ppe / MILLION,
  };
  if (!(shares > 0)) return { available: false, reasons: ["Diluted share count is not positive."] };
  if (liabilities < debt) return { available: false, reasons: ["Reported debt exceeds total liabilities; the debt tags do not reconcile."] };
  if (cash > assets || ppe + (currentAssets - cash) > assets - cash + 1e-6)
    return { available: false, reasons: ["Reported cash, PP&E and current assets do not fit inside total assets."] };

  warnings.push("Operating and finance lease liabilities are not counted as debt unless the company tags them as debt.");

  // Same-year reported ratios, as reference only.
  const hist: HistoricalRatios = {};
  const opIncome = durationAt("OperatingIncomeLoss", end)?.val;
  if (opIncome != null) hist.operatingMargin = opIncome / revenue;
  const dep = (durationAt("DepreciationDepletionAndAmortization", end) ?? durationAt("DepreciationAndAmortization", end) ?? durationAt("Depreciation", end))?.val;
  if (dep != null) hist.depreciationPctRevenue = dep / revenue;
  const capex = (durationAt("PaymentsToAcquirePropertyPlantAndEquipment", end) ?? durationAt("PaymentsToAcquireProductiveAssets", end))?.val;
  if (capex != null) hist.capexPctRevenue = Math.abs(capex) / revenue;
  const pretax = durationAt("IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", end)?.val;
  const tax = durationAt("IncomeTaxExpenseBenefit", end)?.val;
  if (pretax != null && tax != null && pretax > 0 && tax / pretax >= 0 && tax / pretax <= 1) hist.taxRate = tax / pretax;
  const interest = (durationAt("InterestExpense", end) ?? durationAt("InterestExpenseNonoperating", end))?.val;
  if (interest != null && debt > 0 && interest >= 0 && interest / debt <= 1) hist.interestRateOnDebt = interest / debt;
  hist.netWorkingCapitalPctRevenue = nwc / revenue;
  const prior = units("RevenueFromContractWithCustomerExcludingAssessedTax").concat(units("Revenues"), units("SalesRevenueNet"))
    .filter((f) => ok(f) && f.start && (days(f) ?? 0) >= 300 && (days(f) ?? 0) <= 430 && Math.abs(Date.parse(end) - Date.parse(f.end as string) - 365 * 86400000) < 20 * 86400000)
    .reduce<Fact | undefined>((m, f) => (m ? later(m, f) : f), undefined);
  if (prior?.val && prior.val > 0) hist.revenueGrowth = revenue / prior.val - 1;

  return {
    available: true, unit: "USD millions", balanceSheetDate: end, filedAt: filing.filed, form: filing.form,
    starting, sharesOutstanding: shares / MILLION, historical: hist, provenance, warnings,
  };
}
