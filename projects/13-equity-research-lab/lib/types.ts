import type { ThesisReview } from "./thesis-review";
import type { CurrentAffairs } from "./current-affairs";
import type { ScreenResult } from "./screen";
export type ScoreKey =
  | "businessQuality"
  | "financialPerformance"
  | "growthRunway"
  | "industryMoat"
  | "leadershipGovernance"
  | "valuation"
  | "analystExpectations"
  | "sentimentPositioning"
  | "technicalLiquidity"
  | "catalysts"
  | "riskResilience"
  | "portfolioFit";

export type ResearchScores = Record<ScoreKey, number>;
export type DimensionCoverage = Record<ScoreKey, number>;

export type Citation = {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  retrievedAt: string;
  tier: 1 | 2 | 3 | 4 | 5;
};

export type AnalystCall = {
  analyst: string;
  firm: string;
  rating: "Buy" | "Hold" | "Sell" | "Other";
  priceTarget?: number;
  analystRank?: number;
  successRate?: number;
  averageReturn?: number;
  date?: string;
  sourceUrl?: string;
};

export type Scenario = {
  label: "Bull" | "Base" | "Bear";
  probability: number;
  fairValue: number;
  returnPct?: number;
  thesis: string[];
  valuationMethod?: string;
  assumptions?: string[];
};

export type ReverseDcf = {
  available: boolean;
  marketCap?: number;
  baseFreeCashFlow?: number;
  discountRate?: number;
  terminalGrowth?: number;
  explicitYears?: number;
  impliedFcfGrowth?: number;
  note: string;
};

export type OptionIdea = {
  strategy: string;
  fit: "Strong" | "Moderate" | "Weak";
  rationale: string;
  maxLoss: string;
  capitalProfile: string;
  volatilityView: string;
};

export type ExecutiveSummary = { overview: string; strength: string; concern: string; watchFor: string };

export type ResearchRun = {
  scenarioDistribution?: import("./scenario-distribution").Distribution;
  researchCompletion?: import("./research-completion").ResearchCompletion;
  peerValuation?: import("./peer-valuation").PeerValuation;
  evidenceAssessment?: {score:number;label:string;explanation:string;gaps:string[]};
  cost?: import("./cost-types").ReportCost;
  investmentCase?: import("./investment").InvestmentCase;
  integratedResearch?: import("./grounding").WebGrounding;
  executiveSummary?: ExecutiveSummary;
  storage?: "cloud" | "browser" | "unavailable";
  priceTiming?: "end-of-day";
  priceSource?: string;
  id: string;
  ticker: string;
  companyName: string;
  analyzedAt: string;
  marketAsOf?: string;
  asOfPrice: number;
  dataMode: "demo" | "live" | "hybrid";
  skillVersion: string;
  score: number;
  confidence: number;
  verdict: "Buy candidate" | "Watch" | "Avoid for now" | "Insufficient data";
  scores: ResearchScores;
  scoreReasons?: Partial<Record<ScoreKey, string>>;
  annualFinancials?: {
    periodEnd: string; form?: string; filedAt?: string;
    revenue?: number; netIncome?: number; operatingCashFlow?: number;
    capitalExpenditures?: number; freeCashFlow?: number;
  };
  dimensionCoverage?: DimensionCoverage;
  highlights: string[];
  risks: string[];
  catalysts: string[];
  managementCredibility: string[];
  expectationGap: string;
  valuationSummary: string;
  reverseDcf?: ReverseDcf;
  intrinsicValuation?: import("./intrinsic-valuation").IntrinsicValuation;
  analystSummary: string;
  analysts: AnalystCall[];
  scenarios: Scenario[];
  thesisKillers: string[];
  thesisReview?: ThesisReview;
  currentAffairs?: CurrentAffairs;
  /** "light" runs use no AI: a free quick screen instead of a rated report. Absent means a deep (AI) report. */
  tier?: "deep" | "light";
  screen?: ScreenResult;
  optionIdeas: OptionIdea[];
  benchmark: string;
  expectedReturn12m: { low: number; high: number };
  citations: Citation[];
  notes: string[];
};

export type ResearchInput = {
  ticker: string;
  portfolioFit?: number;
};
