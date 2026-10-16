import { singleInvestmentDecision } from './investment';
import type { ResearchRun } from './types';
export type ResearchCompletion = { followUp: boolean; gaps: string[]; attempted: boolean; status: 'decision ready' | 'evidence blocked'; note: string };

/** One targeted follow-up, never a loop until the model says Buy. */
export function completionState(run: ResearchRun): ResearchCompletion {
  const decision = singleInvestmentDecision(run);
  const gaps = [...decision.missing];
  const valuationMissing = !run.investmentCase || run.investmentCase.factors.valuation.rating === 'Unknown';
  if (valuationMissing && run.intrinsicValuation) {
    gaps.push(run.intrinsicValuation.available ? run.intrinsicValuation.warnings.join(' ') : run.intrinsicValuation.note);
  }
  const attempted = run.researchCompletion?.attempted ?? false;
  const ready = decision.available && !valuationMissing;
  const quoteAge = (Date.parse(run.analyzedAt) - Date.parse(run.marketAsOf ?? '')) / 86400000;
  const validQuote = run.asOfPrice > 0 && Number.isFinite(quoteAge) && quoteAge >= 0 && quoteAge <= 7;
  const followUp = run.dataMode !== 'demo' && !ready && !attempted && validQuote;
  return { followUp, gaps: [...new Set(gaps)].slice(0, 8), attempted, status: ready ? 'decision ready' : 'evidence blocked',
    note: ready ? 'The research supports a directional decision; this is not a guarantee of returns.'
      : attempted ? 'The targeted follow-up finished. The remaining evidence does not support a complete decision; no further automatic attempts will run.'
      : !validQuote ? 'A recent verified quote is required before deeper research. Check the market-data connection; web estimates cannot replace a quote.'
      : 'One targeted follow-up can seek the missing evidence. Unsupported valuation assumptions will remain visible.' };
}
