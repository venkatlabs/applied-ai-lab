import { describe, expect, it } from 'vitest';
import { completionState } from '../lib/research-completion';
import { factorKeys, type InvestmentCase } from '../lib/investment';
import type { ResearchRun } from '../lib/types';
const run = {
  analyzedAt: '2026-10-07T12:00:00Z', marketAsOf: '2026-10-07T10:00:00Z', asOfPrice: 100, dataMode: 'live',
  investmentCase: { valuationBasis: 'Unavailable', valuationBenchmark: 'Missing', factors: Object.fromEntries(factorKeys.map(k => [k, { rating: k === 'valuation' ? 'Unknown' : 'Strong', reason: 'Supported', sources: ['https://example.com'], evidenceDate: '2026-10-07' }])) },
  intrinsicValuation: { available: false, version: 'test', note: 'Positive cash earnings are missing.' },
} as unknown as ResearchRun;
describe('bounded research completion', () => {
  it('targets the valuation gap rather than forcing a positive decision', () => {
    const state = completionState(run);
    expect(state.followUp).toBe(true);
    expect(state.status).toBe('evidence blocked');
    expect(state.gaps).toContain('Positive cash earnings are missing.');
  });
  it('stops after one follow-up even when valuation remains incomplete', () => {
    const state = completionState({...run, researchCompletion: {...completionState(run), attempted: true}});
    expect(state.followUp).toBe(false);
    expect(state.note).toContain('no further automatic attempts');
    expect(state.status).toBe('evidence blocked');
  });
  it('does not spend on deeper evidence without a recent verified quote or in demo mode', () => {
    expect(completionState({...run, marketAsOf: undefined}).followUp).toBe(false);
    expect(completionState({...run, marketAsOf: '2026-09-01'}).followUp).toBe(false);
    expect(completionState({...run, dataMode: 'demo'}).followUp).toBe(false);
  });
  it('stops when supported valuation and company factors yield a decision', () => {
    const thesis = run.investmentCase!;
    const state = completionState({...run, investmentCase: {...thesis, valuationBasis: 'Peer comparison', factors: {...thesis.factors, valuation: {...thesis.factors.valuation, rating: 'Weak'}}} as InvestmentCase});
    expect(state.status).toBe('decision ready');
    expect(state.followUp).toBe(false);
  });
});
