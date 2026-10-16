import type { FundamentalsProvider, FundamentalsSnapshot } from "./types";

const SEC_HEADERS = {
  "User-Agent": process.env.SEC_USER_AGENT || "Equity Research Lab research@example.com",
  Accept: "application/json",
};

type TickerMap = Record<string, { cik_str: number; ticker: string; title: string }>;
type FactUnit = { val?: number; form?: string; filed?: string; start?: string; end?: string; fp?: string; fy?: number };

function durationDays(x: FactUnit) {
  if (!x.start || !x.end) return undefined;
  return (new Date(x.end).getTime() - new Date(x.start).getTime()) / 86400000;
}

function annualCandidates(fact: any): FactUnit[] {
  const units = fact?.units?.USD;
  if (!Array.isArray(units)) return [];
  return (units as FactUnit[])
    .filter((x) => ["10-K", "10-K/A", "20-F", "20-F/A", "40-F", "40-F/A"].includes(x.form ?? "") && x.end && x.filed && typeof x.val === "number")
    .filter((x) => {
      const days = durationDays(x);
      return days != null && days >= 300 && days <= 430;
    });
}

function quarterCandidates(fact: any): FactUnit[] {
  const units = fact?.units?.USD;
  if (!Array.isArray(units)) return [];
  return (units as FactUnit[])
    .filter((x) => x.form === "10-Q" && x.end && x.filed && typeof x.val === "number")
    .filter((x) => {
      const days = durationDays(x);
      return days != null && days >= 60 && days <= 120;
    });
}

function newest(candidates: FactUnit[]) {
  return candidates.sort((a, b) => {
    const endCompare = String(b.end).localeCompare(String(a.end));
    if (endCompare !== 0) return endCompare;
    return String(b.filed).localeCompare(String(a.filed));
  })[0];
}

/** USD balance-sheet facts from domestic and foreign SEC filings. */
export function latestInstantFact(fact: any): FactUnit | undefined {
  return newest(((fact?.units?.USD ?? []) as FactUnit[]).filter(x =>
    ['10-K', '10-Q', '10-K/A', '10-Q/A', '20-F', '20-F/A', '40-F', '40-F/A', '6-K'].includes(x.form ?? '') &&
    !x.start && x.end && x.filed && typeof x.val === 'number' && Number.isFinite(x.val)));
}

function latestAnnualAcross(...facts: any[]): FactUnit | undefined {
  return newest(facts.flatMap(annualCandidates));
}

function latestQuarterAcross(...facts: any[]): FactUnit | undefined {
  return newest(facts.flatMap(quarterCandidates));
}

function latestFiling(submissions: any, form: string, cikNumber: number) {
  const recent = submissions?.filings?.recent;
  if (!recent?.form || !Array.isArray(recent.form)) return undefined;
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] !== form) continue;
    const accession = recent.accessionNumber?.[i];
    const primaryDocument = recent.primaryDocument?.[i];
    if (!accession || !primaryDocument) continue;
    const accessionNoDashes = String(accession).replaceAll("-", "");
    return {
      form,
      filedAt: recent.filingDate?.[i],
      periodEnd: recent.reportDate?.[i],
      url: `https://www.sec.gov/Archives/edgar/data/${cikNumber}/${accessionNoDashes}/${primaryDocument}`,
    };
  }
  return undefined;
}

export class SecProvider implements FundamentalsProvider {
  /** Raw companyfacts (all historical facts with filing dates) for point-in-time backtests. */
  async getCompanyFacts(ticker: string): Promise<unknown> {
    const tickersRes = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: SEC_HEADERS, signal: AbortSignal.timeout(12000), next: { revalidate: 86400 } });
    if (!tickersRes.ok) throw new Error(`SEC ticker lookup failed: ${tickersRes.status}`);
    const map = (await tickersRes.json()) as TickerMap;
    const match = Object.values(map).find((x) => x.ticker.toUpperCase().replaceAll(".", "-") === ticker.toUpperCase().replaceAll(".", "-"));
    if (!match) throw new Error(`Ticker ${ticker} not found in SEC company map`);
    const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${String(match.cik_str).padStart(10, "0")}.json`, { headers: SEC_HEADERS, signal: AbortSignal.timeout(20000), cache: "no-store" });
    if (!res.ok) throw new Error(`SEC companyfacts failed: ${res.status}`);
    return res.json();
  }
  async getFundamentals(ticker: string): Promise<FundamentalsSnapshot> {
    const retrievedAt = new Date().toISOString();
    const tickersRes = await fetch("https://www.sec.gov/files/company_tickers.json", { headers: SEC_HEADERS, signal: AbortSignal.timeout(12000), next: { revalidate: 86400 } });
    if (!tickersRes.ok) throw new Error(`SEC ticker lookup failed: ${tickersRes.status}`);
    const tickerMap = (await tickersRes.json()) as TickerMap;
    const match = Object.values(tickerMap).find((x) => x.ticker.toUpperCase().replaceAll(".", "-") === ticker.toUpperCase().replaceAll(".", "-"));
    if (!match) throw new Error(`Ticker ${ticker} not found in SEC company map`);

    const cik = String(match.cik_str).padStart(10, "0");
    const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;

    const [factsRes, submissionsRes] = await Promise.all([
      fetch(factsUrl, { headers: SEC_HEADERS, signal: AbortSignal.timeout(12000), next: { revalidate: 21600 } }),
      fetch(submissionsUrl, { headers: SEC_HEADERS, signal: AbortSignal.timeout(12000), next: { revalidate: 21600 } }),
    ]);
    if (!factsRes.ok) throw new Error(`SEC companyfacts failed: ${factsRes.status}`);

    const data = await factsRes.json();
    const submissions = submissionsRes.ok ? await submissionsRes.json() : null;
    const gaap = data?.facts?.["us-gaap"] ?? {};

    const equity = latestInstantFact(gaap.StockholdersEquity);
    // Balance sheet (instant facts). Every component must share one balance-sheet date.
    const instant = latestInstantFact;
    const cashFactBs = instant(gaap.CashAndCashEquivalentsAtCarryingValue) ?? instant(gaap.CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents);
    const bsDate = cashFactBs?.end;
    const onDate = (fact: any) => { const f = instant(fact); return f && f.end === bsDate ? f.val : undefined; };
    const sum = (...xs: (number | undefined)[]) => xs.some(x => x != null) ? xs.reduce<number>((a, x) => a + (x ?? 0), 0) : undefined;
    const balanceCash = bsDate ? sum(cashFactBs?.val, onDate(gaap.ShortTermInvestments) ?? onDate(gaap.MarketableSecuritiesCurrent) ?? onDate(gaap.AvailableForSaleSecuritiesDebtSecuritiesCurrent)) : undefined;
    const totalLtd = onDate(gaap.LongTermDebt);
    const balanceDebt = bsDate ? (totalLtd != null ? sum(totalLtd, onDate(gaap.ShortTermBorrowings), onDate(gaap.CommercialPaper))
      : sum(onDate(gaap.LongTermDebtNoncurrent), onDate(gaap.LongTermDebtCurrent), onDate(gaap.ShortTermBorrowings), onDate(gaap.CommercialPaper))) : undefined;
    const revenueFact = latestAnnualAcross(
      gaap.RevenueFromContractWithCustomerExcludingAssessedTax,
      gaap.Revenues,
      gaap.SalesRevenueNet,
    );
    const epsUnits=gaap.EarningsPerShareDiluted?.units?.["USD/shares"] ?? gaap.EarningsPerShareBasicAndDiluted?.units?.["USD/shares"];
    const epsFact=latestAnnualAcross({units:{USD:epsUnits}});
    const incomeFact = latestAnnualAcross(gaap.NetIncomeLoss, gaap.ProfitLoss);
    const cashFact = latestAnnualAcross(
      gaap.NetCashProvidedByUsedInOperatingActivities,
      gaap.NetCashProvidedByUsedInOperatingActivitiesContinuingOperations,
    );
    const capexFact = latestAnnualAcross(
      gaap.PaymentsToAcquirePropertyPlantAndEquipment,
      gaap.PaymentsToAcquireProductiveAssets,
    );

    const quarterRevenue = latestQuarterAcross(
      gaap.RevenueFromContractWithCustomerExcludingAssessedTax,
      gaap.Revenues,
      gaap.SalesRevenueNet,
    );
    const quarterIncome = latestQuarterAcross(gaap.NetIncomeLoss, gaap.ProfitLoss);
    const quarterGrossProfit = latestQuarterAcross(gaap.GrossProfit);

    const periodCandidates = [revenueFact, incomeFact, cashFact].filter(Boolean) as FactUnit[];
    const annualAnchor = newest(periodCandidates);
    const quarterCandidatesForAnchor = [quarterRevenue, quarterIncome, quarterGrossProfit].filter(Boolean) as FactUnit[];
    const quarterAnchor = newest(quarterCandidatesForAnchor);
    const latest10Q = submissions ? latestFiling(submissions, "10-Q", match.cik_str) : undefined;

    // Every metric must share the anchor period. Never combine an obsolete tag
    // with a current-period metric simply because both are the latest for that tag.
    const annualValue = (fact?: FactUnit) => fact?.end === annualAnchor?.end && fact?.start === annualAnchor?.start ? fact?.val : undefined;
    const quarterValue = (fact?: FactUnit) => fact?.end === quarterAnchor?.end && fact?.start === quarterAnchor?.start ? fact?.val : undefined;
    const operatingCashFlow = annualValue(cashFact);
    const capexValue = annualValue(capexFact);
    const capitalExpenditures = capexValue != null ? Math.abs(capexValue) : undefined;
    const freeCashFlow = operatingCashFlow != null && capitalExpenditures != null
      ? operatingCashFlow - capitalExpenditures
      : undefined;
    const latestQuarterRevenue = quarterValue(quarterRevenue);
    const latestQuarterGrossProfit = quarterValue(quarterGrossProfit);
    const latestQuarterGrossMargin =
      latestQuarterRevenue && latestQuarterGrossProfit
        ? latestQuarterGrossProfit / latestQuarterRevenue
        : undefined;

    const citations: FundamentalsSnapshot["citations"] = [
      { title: `${match.title} SEC company facts`, url: factsUrl, source: "SEC", retrievedAt, tier: 1 },
    ];
    if (latest10Q?.url) {
      citations.push({
        title: `${match.title} latest 10-Q`,
        url: latest10Q.url,
        source: "SEC",
        publishedAt: latest10Q.filedAt,
        retrievedAt,
        tier: 1,
      });
    }

    return {
      annualDilutedEps: annualValue(epsFact),
      financialInstitution: Boolean(gaap.Deposits || gaap.InterestBearingDepositLiabilities || gaap.LiabilityForFuturePolicyBenefits || gaap.PolicyholderBenefitsAndClaimsIncurredNet),
      cash: balanceCash,
      debt: balanceDebt,
      cashDebtDate: bsDate,
      stockholdersEquity: equity?.val,
      balanceSheetDate: equity?.end,
      companyName: data?.entityName ?? match.title,
      revenue: annualValue(revenueFact),
      netIncome: annualValue(incomeFact),
      operatingCashFlow,
      capitalExpenditures,
      freeCashFlow,
      latestAnnualPeriodEnd: annualAnchor?.end,
      latestAnnualForm: annualAnchor?.form,
      latestAnnualFiledAt: annualAnchor?.filed,
      latestQuarterPeriodEnd: quarterAnchor?.end ?? latest10Q?.periodEnd,
      latestQuarterFiledAt: quarterAnchor?.filed ?? latest10Q?.filedAt,
      latestQuarterRevenue,
      latestQuarterNetIncome: quarterValue(quarterIncome),
      latestQuarterGrossProfit,
      latestQuarterGrossMargin,
      latestQuarterFormUrl: latest10Q?.periodEnd === quarterAnchor?.end ? latest10Q?.url : undefined,
      citations,
    };
  }
}
