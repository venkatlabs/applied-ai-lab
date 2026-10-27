import { buildDistribution } from "./scenario-distribution";
import { completionState } from './research-completion';
import { researchGaps } from './server/web-research';
import { validateCurrentAffairs } from "./current-affairs";
import { buildScreen } from "./screen";
import { validateThesisReview, researchQuestions } from "./thesis-review";
import { peerResearch } from "./server/peer-research";
import { assessDecisionEvidence } from "./decision-evidence";
import { withCosts } from "./server/research-cost";
import { integratedResearch } from "./server/integrated-research";
import { validateInvestmentCase, singleInvestmentDecision } from "./investment";
import { ageDays } from "./confidence";
import { demoResearch } from "./mock-data";
import { providers } from "./providers";
import { weightedCoverage } from "./scoring";
import { addYearsIso, reverseDcfFromMarketCap, selectHorizonEstimate } from "./valuation";
import { intrinsicValuation, valuationScenarios } from "./intrinsic-valuation";
import { applyDeterministicValuation } from "./valuation-factor";
import { peerGroup } from "./peer-valuation";
import type { AnalystCall, Citation, DimensionCoverage, ResearchRun, ResearchScores } from "./types";

const EMPTY_SCORES: ResearchScores = {
  businessQuality: 0, financialPerformance: 0, growthRunway: 0, industryMoat: 0,
  leadershipGovernance: 0, valuation: 0, analystExpectations: 0, sentimentPositioning: 0,
  technicalLiquidity: 0, catalysts: 0, riskResilience: 0, portfolioFit: 0,
};

function liveShell(ticker: string): ResearchRun {
  return {
    id: crypto.randomUUID(), ticker, companyName: ticker, analyzedAt: new Date().toISOString(),
    asOfPrice: 0, dataMode: "hybrid", skillVersion: "equity-research-v0.15.1",
    score: 0, confidence: 0, verdict: "Insufficient data", scores: { ...EMPTY_SCORES },
    highlights: [], risks: [], catalysts: [], managementCredibility: [],
    expectationGap: "Awaiting sufficient live evidence.", valuationSummary: "No valuation conclusion yet.",
    analystSummary: "No analyst evidence loaded yet.", analysts: [], scenarios: [], thesisKillers: [],
    optionIdeas: [], benchmark: "SPY", expectedReturn12m: { low: 0, high: 0 }, citations: [], notes: [],
  };
}

function dimensionCoverage(args: {
  hasAnnual: boolean;
  hasQuarter: boolean;
  hasFcf: boolean;
  hasEstimates: boolean;
  hasMultipleEstimates: boolean;
  hasTargets: boolean;
  hasTechnicals: boolean;
  hasLatest10Q: boolean;
  hasHorizonEps: boolean;
}): DimensionCoverage {
  return {
    businessQuality: args.hasQuarter && args.hasAnnual ? 55 : args.hasAnnual ? 40 : 20,
    financialPerformance: args.hasQuarter && args.hasAnnual ? 95 : args.hasAnnual ? 75 : 25,
    growthRunway: args.hasMultipleEstimates ? 80 : args.hasEstimates ? 60 : 20,
    industryMoat: 20,
    leadershipGovernance: 15,
    valuation: args.hasFcf && args.hasHorizonEps ? 90 : args.hasHorizonEps ? 75 : 35,
    analystExpectations: args.hasEstimates && args.hasTargets ? 85 : args.hasEstimates ? 65 : 25,
    sentimentPositioning: args.hasTargets ? 55 : 30,
    technicalLiquidity: args.hasTechnicals ? 70 : 45,
    catalysts: args.hasQuarter && args.hasEstimates ? 40 : 25,
    riskResilience: args.hasLatest10Q ? 45 : args.hasAnnual ? 30 : 20,
    portfolioFit: 20,
  };
}


export async function runResearch(tickerRaw: string, focus?: string[], tier: "deep" | "light" = "deep"): Promise<ResearchRun> {
  const {value,cost}=await withCosts(async()=>{ const result = await research(tickerRaw, focus, tier); result.researchCompletion = completionState({...result, researchCompletion: {attempted: !!focus} as ResearchRun["researchCompletion"]}); return result; });
  return {...value,cost};
}
async function research(tickerRaw: string, focus?: string[], tier: "deep" | "light" = "deep"): Promise<ResearchRun> {
  const ticker = tickerRaw.trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(ticker)) throw new Error("Invalid ticker symbol");
  if (process.env.NEXT_PUBLIC_APP_MODE !== "live") return demoResearch(ticker);

  const run = liveShell(ticker);
  const errors: string[] = [];
  const citations: Citation[] = [];
  let liveComponents = 0;
  let fundamentals: Awaited<ReturnType<typeof providers.sec.getFundamentals>> | null = null;
  let market: Awaited<ReturnType<typeof providers.market.getMarket>> | null = null;
  let analystData: Awaited<ReturnType<typeof providers.analysts.getAnalysts>> | null = null;

  const [secResult, marketResult, analystResult] = await Promise.allSettled([
    providers.sec.getFundamentals(ticker),
    providers.market.getMarket(ticker),
    providers.analysts.getAnalysts(ticker),
  ]);

  if (secResult.status === "fulfilled") {
    fundamentals = secResult.value;
    run.companyName = secResult.value.companyName ?? run.companyName;
    citations.push(...secResult.value.citations);
    liveComponents += 1;
  } else errors.push(secResult.reason instanceof Error ? secResult.reason.message : "SEC provider failed");

  if (marketResult.status === "fulfilled") {
    market = marketResult.value;
    run.companyName = market.companyName ?? run.companyName;
    run.asOfPrice = market.price ?? 0;
    run.marketAsOf = market.timestamp;
    run.priceTiming = market.priceTiming;
    run.priceSource = market.source;
    errors.push(...(market.notes ?? []));
    citations.push(...market.citations);
    liveComponents += 1;
  } else errors.push(marketResult.reason instanceof Error ? marketResult.reason.message : "FMP market provider failed");

  if (analystResult.status === "fulfilled") {
    analystData = analystResult.value;
    citations.push(...analystData.citations);
    errors.push(...analystData.unavailable);
    if (analystData.estimates.length || analystData.consensusTarget) liveComponents += 1;
  } else errors.push(analystResult.reason instanceof Error ? analystResult.reason.message : "FMP analyst provider failed");

  if (fundamentals?.latestAnnualPeriodEnd) {
    run.annualFinancials = {
      periodEnd: fundamentals.latestAnnualPeriodEnd, form: fundamentals.latestAnnualForm,
      filedAt: fundamentals.latestAnnualFiledAt, revenue: fundamentals.revenue,
      netIncome: fundamentals.netIncome, operatingCashFlow: fundamentals.operatingCashFlow,
      capitalExpenditures: fundamentals.capitalExpenditures, freeCashFlow: fundamentals.freeCashFlow,
    };
  }
  run.citations = citations;
  run.dataMode = liveComponents >= 3 ? "live" : "hybrid";
  if (!market?.price || !Number.isFinite(market.price) || market.price <= 0) {
    run.expectationGap = "Price-based expectations analysis is unavailable because the market-data provider did not supply a verified quote.";
    run.valuationSummary = "Valuation and return scenarios are withheld until a verified market price and suitable forecasts are available.";
    run.notes = ["Live research stopped before AI synthesis because no verified current price was available.",
      run.annualFinancials ? `Verified annual ${run.annualFinancials.form ?? "filing"} figures for ${run.annualFinancials.periodEnd} are shown separately; these do not establish a current investment verdict.` : "No supported annual financial facts were extracted; a source link alone does not establish financial coverage.",
      "For HTTP 402, check the configured FMP account's endpoint and symbol entitlements. The application cannot determine the exact subscription from the HTTP status alone.",
      ...errors.map((x) => `Provider note: ${x}`)];
    return run;
  }

  const peerWork=peerResearch(ticker,fundamentals,market,run.analyzedAt).catch(()=>undefined);
  try {
    if (tier === "light") throw new Error("quick screen: no AI");
    run.integratedResearch = focus ? await researchGaps(run, true, focus) : await integratedResearch(run);
    for (const source of run.integratedResearch.citations) {
      if (!citations.some(c => c.url === source.url)) citations.push({ title: source.title, url: source.url, source: "Web research", retrievedAt: run.integratedResearch.generatedAt, tier: 3 });
    }
  } catch { if (tier !== "light") errors.push(focus ? "The targeted evidence follow-up did not complete. Unsupported factors remain unknown; automatic attempts have stopped." : "Automatic web research did not complete. Unsupported investment factors remain unknown."); }

  run.peerValuation=await peerWork;
  for(const row of run.peerValuation?.rows??[])for(const c of row.sources)if(!citations.some(x=>x.url===c.url))citations.push(c);
  const latestActualPeriod = fundamentals?.latestAnnualPeriodEnd;
  const analysisDate = run.analyzedAt.slice(0, 10);
  const targetDate12m = addYearsIso(analysisDate, 1);
  const forwardEstimates = (analystData?.estimates ?? [])
    .filter((x) => x.date)
    .filter((x) => !latestActualPeriod || String(x.date) > latestActualPeriod)
    .filter((x) => String(x.date) > analysisDate)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 6);

  const horizonEstimate = selectHorizonEstimate(forwardEstimates, analysisDate, 1);
  const reverseDcf = reverseDcfFromMarketCap(market.marketCap, fundamentals?.freeCashFlow);
  run.reverseDcf = reverseDcf;

  const hasAnnual = Boolean(fundamentals?.revenue != null && ageDays(run.analyzedAt, fundamentals?.latestAnnualPeriodEnd) <= 460);
  const hasQuarter = Boolean(fundamentals?.latestQuarterRevenue != null && ageDays(run.analyzedAt, fundamentals?.latestQuarterPeriodEnd) <= 190);
  const coverage = dimensionCoverage({
    hasAnnual,
    hasQuarter,
    hasFcf: Boolean(hasAnnual && fundamentals?.freeCashFlow != null),
    hasEstimates: forwardEstimates.length > 0,
    hasMultipleEstimates: forwardEstimates.length >= 2,
    hasTargets: Boolean(analystData?.consensusTarget),
    hasTechnicals: Boolean(market.priceAvg50 && market.priceAvg200),
    hasLatest10Q: Boolean(hasQuarter && fundamentals?.latestQuarterFormUrl),
    hasHorizonEps: Boolean(horizonEstimate?.epsAvg),
  });
  run.dimensionCoverage = coverage;
  const evidenceCoverage = weightedCoverage(coverage);

  const intrinsic = intrinsicValuation({ asOf: run.analyzedAt,
    price: market.price, marketCap: market.marketCap, revenue: fundamentals?.revenue,
    operatingCashFlow: fundamentals?.operatingCashFlow, capitalExpenditures: fundamentals?.capitalExpenditures,
    freeCashFlow: fundamentals?.freeCashFlow, netIncome: fundamentals?.netIncome,
    cash: fundamentals?.cash, debt: fundamentals?.debt, annualPeriodEnd: fundamentals?.latestAnnualPeriodEnd,
    estimates: analystData?.estimates ?? [],
    financialInstitution: fundamentals?.financialInstitution || peerGroup(ticker)?.metric === "book",
    cyclical: ["Exploration and production", "Integrated energy"].includes(peerGroup(ticker)?.sector ?? ""),
  });
  run.intrinsicValuation = intrinsic;
  const scenarios = valuationScenarios(intrinsic, market.price);
  if (tier === "light") {
    // Free quick screen: filings, quote, deterministic DCF and peers only. No web research and no AI synthesis.
    run.tier = "light";
    run.screen = buildScreen({
      price: market.price, priceAvg50: market.priceAvg50, priceAvg200: market.priceAvg200,
      netIncome: fundamentals?.netIncome, freeCashFlow: fundamentals?.freeCashFlow, operatingCashFlow: fundamentals?.operatingCashFlow, cash: fundamentals?.cash, debt: fundamentals?.debt,
      intrinsic: intrinsic.available ? { available: true, upsidePct: intrinsic.upsidePct } : { available: false },
      growth: intrinsic.available ? intrinsic.growth : null, peerRelativeDiscount: run.peerValuation?.relativeDiscount ?? null,
    });
    run.asOfPrice = market.price;
    run.scenarios = scenarios;
    run.notes = ["Quick screen only: no web research and no AI analysis were run, so there is no rating. Run deep research to get a verdict.", ...errors.map(x => `Data coverage note: ${x}`)];
    return run;
  }
  const evidence = {
    peerValuation: run.peerValuation ?? {status:"incomplete",note:"No supported peer group is configured. Do not invent a benchmark."},
    integratedWebResearch: run.integratedResearch ?? null,
    sourceCatalog: citations,
    researchQuestions: researchQuestions(ticker),
    deterministicValuation: intrinsic,
    valuationPolicy: "The deterministic valuation above is computed in code from SEC filings, the verified price and consensus revenue forecasts. It is the primary valuation evidence. Do not invent a different intrinsic value; critique its assumptions (growth, cash-earnings base, heavy investment, balance sheet) in valuationSummary and in the valuation factor reason. If peer comparison is available, compare it with the DCF. The application sets the final valuation rating in code.",
    ticker,
    companyName: run.companyName,
    analysisTimestampUtc: run.analyzedAt,
    valuationTargetDate12m: targetDate12m,
    currentMarket: market,
    latestReportedAnnual: fundamentals ? {
      periodEnd: fundamentals.latestAnnualPeriodEnd,
      filedAt: fundamentals.latestAnnualFiledAt,
      revenue: fundamentals.revenue,
      netIncome: fundamentals.netIncome,
      operatingCashFlow: fundamentals.operatingCashFlow,
      capitalExpenditures: fundamentals.capitalExpenditures,
      freeCashFlow: fundamentals.freeCashFlow,
    } : null,
    latestReportedQuarter: fundamentals ? {
      periodEnd: fundamentals.latestQuarterPeriodEnd,
      filedAt: fundamentals.latestQuarterFiledAt,
      revenue: fundamentals.latestQuarterRevenue,
      netIncome: fundamentals.latestQuarterNetIncome,
      grossProfit: fundamentals.latestQuarterGrossProfit,
      grossMargin: fundamentals.latestQuarterGrossMargin,
      filingUrl: fundamentals.latestQuarterFormUrl,
    } : null,
    forwardAnalystEstimates: forwardEstimates,
    valuationHorizonEstimate: horizonEstimate ?? null,
    analystConsensus: analystData ? {
      consensusTarget: analystData.consensusTarget,
      targetHigh: analystData.targetHigh,
      targetLow: analystData.targetLow,
      targetMedian: analystData.targetMedian,
      unavailable: analystData.unavailable,
    } : null,
    reverseDcf,
    dimensionEvidenceCoverage: coverage,
    weightedEvidenceCoverage: evidenceCoverage,
    sourcePolicy: "SEC facts and filings are primary-source evidence. FMP quote/consensus/estimates are market-data evidence. Missing qualitative evidence must not be filled from model memory.",
  };

  try {
    const ai = await providers.ai.synthesize(evidence);
    run.investmentCase = applyDeterministicValuation(validateInvestmentCase(ai.investmentCase, citations.map(c => c.url), run.analyzedAt), intrinsic, {
      secUrl: fundamentals?.citations[0]?.url, asOf: (market.timestamp ?? run.analyzedAt).slice(0, 10), peerComparable: run.peerValuation?.status === "comparison available",
    });
    run.evidenceAssessment=assessDecisionEvidence(run);
    run.confidence=run.evidenceAssessment.score;
    const decision = singleInvestmentDecision(run);
    // One scoring model: the six-factor investment score (0 when evidence is insufficient).
    run.score = decision.score ?? 0;
    run.verdict = !decision.available ? "Insufficient data" : decision.action === "Buy candidate" ? "Buy candidate" : decision.action === "Avoid / review selling" ? "Avoid for now" : "Watch";
    run.scenarioDistribution = buildDistribution(ai.scenarioDistribution, citations, run.analyzedAt);
    run.executiveSummary = ai.executiveSummary;
    run.highlights = ai.highlights;
    run.risks = ai.risks;
    run.catalysts = ai.catalysts;
    run.managementCredibility = ai.managementCredibility;
    run.expectationGap = ai.expectationGap;
    run.valuationSummary = ai.valuationSummary;
    run.analystSummary = ai.analystSummary;
    run.thesisKillers = ai.thesisKillers;
    if (ai.thesisReview) run.thesisReview = validateThesisReview(ai.thesisReview, citations, run.analyzedAt);
    if (ai.currentAffairs) run.currentAffairs = validateCurrentAffairs(ai.currentAffairs, citations, run.analyzedAt);
    run.optionIdeas = []; // No live options chain; do not assign unsupported strategy fit.
    run.benchmark = "SPY";
    run.analysts = (analystData?.calls ?? []) as AnalystCall[];

    run.scenarios = scenarios;

    if (run.scenarios.length) {
      const returns = run.scenarios.map((s) => (s.fairValue / run.asOfPrice - 1) * 100);
      run.expectedReturn12m = {
        low: Number(Math.min(...returns).toFixed(1)),
        high: Number(Math.max(...returns).toFixed(1)),
      };
    } else {
      run.notes.push(`Intrinsic value range withheld: ${intrinsic.available ? "price unavailable" : intrinsic.note}`);
    }

    run.notes = [
      run.evidenceAssessment.explanation,
      "The investment score uses six sourced factors. The valuation factor is set in code from a deterministic DCF (see Intrinsic value), made more conservative when a peer comparison disagrees. Intrinsic values are not 12-month price targets.",
      "Factor ratings map to 10/30/50/70/90 (Unknown = 50) with fixed weights: growth 20%, cash 20%, valuation 25%, competition 15%, execution 10%, market 10%. Missing evidence lowers evidence coverage instead of implying a bad company.",
      latestActualPeriod ? `Latest annual period: ${latestActualPeriod}; latest reported interim quarter (10-Q): ${fundamentals?.latestQuarterPeriodEnd ?? "unavailable"}.` : "Latest annual period unavailable.",
      `12-month valuation target date: ${targetDate12m}; selected fiscal EPS period: ${horizonEstimate?.date ?? "unavailable"}.`,
      "Sell-side price targets remain sentiment evidence only.",
      ...run.notes,
      ...errors.map((x) => `Data coverage note: ${x}`),
    ];
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "OpenAI synthesis failed");
    run.notes = ["Live evidence loaded, but the AI synthesis failed. No demo score or verdict was substituted.", ...errors.map((x) => `Provider note: ${x}`)];
  }

  return run;
}
