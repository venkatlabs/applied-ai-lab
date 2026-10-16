import type { ResearchRun } from './types';
import { factorKeys, factorLabels, factorPoints, factorWeights, singleInvestmentDecision, type InvestmentCase } from './investment';

/** Deterministic breakdown of the one six-factor score. It reuses the exact weights and points that produce the score. */
export type FactorRow = {
  key: (typeof factorKeys)[number]; label: string; rating: string; points: number; weight: number; contribution: number;
  evidenceDate: string; ageDays: number | null; staleAfterDays: number; stale: boolean; sources: number; status: 'Sourced' | 'Missing';
};
export type ScoreBreakdown = {
  rows: FactorRow[]; weightedTotal: number; score: number | null; capped: boolean; available: boolean; missing: string[];
};

const dayMs = 86400000;
export function scoreBreakdown(run: Pick<ResearchRun, 'investmentCase' | 'analyzedAt' | 'dataMode' | 'asOfPrice' | 'marketAsOf'>): ScoreBreakdown | null {
  const thesis: InvestmentCase | undefined = run.investmentCase;
  if (!thesis) return null;
  const decision = singleInvestmentDecision(run as ResearchRun);
  const rows = factorKeys.map((key): FactorRow => {
    const factor = thesis.factors[key];
    const age = (Date.parse(run.analyzedAt) - Date.parse(factor.evidenceDate)) / dayMs;
    const ageDays = Number.isFinite(age) && /^\d{4}-\d{2}-\d{2}$/.test(factor.evidenceDate) ? Math.floor(age) : null;
    const staleAfterDays = key === 'market' || key === 'valuation' ? 120 : 460;
    const status = factor.rating !== 'Unknown' && factor.sources.length > 0 && ageDays !== null ? 'Sourced' : 'Missing';
    const points = factorPoints[factor.rating];
    return { key, label: factorLabels[key], rating: factor.rating, points, weight: factorWeights[key], contribution: points * factorWeights[key],
      evidenceDate: ageDays === null ? '' : factor.evidenceDate, ageDays, staleAfterDays, stale: ageDays !== null && ageDays > staleAfterDays, sources: factor.sources.length, status };
  });
  const weightedTotal = Math.round(rows.reduce((sum, r) => sum + r.contribution, 0));
  return { rows, weightedTotal, score: decision.score, capped: decision.score !== null && decision.score !== weightedTotal, available: decision.available, missing: decision.missing };
}
