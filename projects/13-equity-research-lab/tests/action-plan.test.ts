import { describe, expect, it } from 'vitest';
import { portfolioActionPlan, stockActionSummary } from '../lib/action-plan';
import type { Holdings } from '../lib/holdings';
import type { QuickCheck } from '../lib/quick-check';
import type { ResearchRun } from '../lib/types';

const now = new Date('2026-10-20T12:00:00Z');
const holdings: Holdings = {
  version: 1,
  scope: 'Synthetic portfolio',
  asOf: '2026-10-20',
  coverage: 'complete',
  totalValue: 100_000,
  cashAvailable: 20_000,
  positions: [
    { symbol: 'MSFT', shares: 150, price: 100, averageCost: 50, kind: 'stock' },
    { symbol: 'NBIS', shares: 30, price: 100, averageCost: 125, kind: 'stock' },
    { symbol: 'PG', shares: 50, price: 100, kind: 'stock' },
    { symbol: 'VTI', shares: 200, price: 100, averageCost: 90, kind: 'fund' },
  ],
};
const check = (ticker: string, zone: QuickCheck['zone']): QuickCheck => ({
  ticker, zone, buyBelow: 110, priceDate: '2026-10-20', checkedAt: now.toISOString(),
  valuation: { available: true },
} as unknown as QuickCheck);

describe('portfolio action plan', () => {
  it('ranks risk reduction before buys and carries sizing, evidence and tax context', () => {
    const plan = portfolioActionPlan(holdings, {
      MSFT: check('MSFT', 'Expensive'),
      NBIS: check('NBIS', 'Buy zone'),
    }, [], undefined, now);
    expect(plan.actions[0]).toMatchObject({ symbol: 'MSFT', label: 'TRIM CANDIDATE', priority: 'Review now', amountUsd: 5000 });
    expect(plan.actions.find(a => a.symbol === 'NBIS')).toMatchObject({ label: 'BUY / ADD CANDIDATE', priority: 'Opportunity', evidence: 'quick valuation' });
    expect(plan.actions.find(a => a.symbol === 'NBIS')?.taxContext).toMatch(/tax-loss review/);
    expect(plan.actions.find(a => a.symbol === 'PG')?.label).toBe('RESEARCH FIRST');
    expect(plan.actions.find(a => a.symbol === 'VTI')?.label).toBe('REVIEW FUND EXPOSURE');
    expect(plan.blockers.join(' ')).toMatch(/look-through/);
  });

  it('makes missing tax data and partial coverage explicit instead of inventing precision', () => {
    const partial: Holdings = {
      ...holdings,
      coverage: 'partial',
      positions: holdings.positions.map(p => p.symbol === 'MSFT' ? { ...p, averageCost: undefined } : p),
    };
    const plan = portfolioActionPlan(partial, { MSFT: check('MSFT', 'Expensive') }, [], undefined, now);
    const msft = plan.actions.find(a => a.symbol === 'MSFT')!;
    expect(plan.blockers.join(' ')).toMatch(/partial/);
    expect(msft.blockers.join(' ')).toMatch(/Cost basis\/tax lots/);
  });

  it('blocks a stale archived report from becoming a new-position buy candidate', () => {
    const factor = { rating: 'Strong', reason: 'Synthetic evidence', sources: ['https://example.com'], evidenceDate: '2026-08-01' } as const;
    const run = {
      ticker: 'OLD',
      dataMode: 'live',
      analyzedAt: '2026-08-01T12:00:00Z',
      marketAsOf: '2026-08-01',
      asOfPrice: 100,
      investmentCase: {
        valuationBasis: 'Independent cash-flow valuation', valuationBenchmark: 'Synthetic',
        factors: { growth: factor, cash: factor, valuation: factor, competition: factor, execution: factor, market: factor },
        growthOutlook: 'Synthetic', strongestCounterargument: 'Synthetic', timing: 'Synthetic', changeMind: 'Synthetic',
      },
    } as unknown as ResearchRun;
    const action = stockActionSummary(run, holdings, undefined, now);
    expect(action.label).toBe('RESEARCH FIRST');
    expect(action.blockers.join(' ')).toMatch(/older than 30 days/);
  });

  it('preserves missing-evidence blockers for an owned stock', () => {
    const run = {
      ticker: 'MSFT', dataMode: 'live', analyzedAt: '2026-10-20T12:00:00Z', marketAsOf: '2026-10-20', asOfPrice: 100,
    } as unknown as ResearchRun;
    const action = stockActionSummary(run, holdings, undefined, now);
    expect(action.blockers.join(' ')).toMatch(/current method|fresh report|unified investment method/);
  });
});

describe('stock action summary', () => {
  it('turns a fresh high-quality stock report into an initiation candidate with portfolio room', () => {
    const factor = { rating: 'Strong', reason: 'Synthetic evidence', sources: ['https://example.com'], evidenceDate: '2026-10-20' } as const;
    const run = {
      ticker: 'NEW',
      dataMode: 'live',
      analyzedAt: '2026-10-20T12:00:00Z',
      marketAsOf: '2026-10-20',
      asOfPrice: 100,
      investmentCase: {
        valuationBasis: 'Independent cash-flow valuation',
        valuationBenchmark: 'Synthetic',
        factors: { growth: factor, cash: factor, valuation: factor, competition: factor, execution: factor, market: factor },
        growthOutlook: 'Synthetic', strongestCounterargument: 'Synthetic', timing: 'Price and evidence support review now.', changeMind: 'A material thesis break.',
      },
    } as unknown as ResearchRun;
    const action = stockActionSummary(run, holdings, undefined, now);
    expect(action.label).toBe('BUY / ADD CANDIDATE');
    expect(action.roomUsd).toBe(10_000);
    expect(action.whatChanges).toBe('A material thesis break.');
  });
});
