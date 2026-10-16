import { describe, expect, it } from 'vitest';
import { connectedHoldings, type ConnectedSnapshot } from '../lib/connected-portfolio';

const snapshot: ConnectedSnapshot = {
  retrievedAt: '2026-10-02T10:00:00.000Z', excludedAccountCount: 1,
  accounts: [
    { institution: 'Fidelity', name: 'Brokerage', type: 'Brokerage', category: 'investment', status: 'open', reportedTotal: { amount: '1000', currency: 'USD' }, lastHoldingsSync: '2026-10-02T09:00:00Z', positionsAsOf: '2026-10-02T09:00:00Z', positionsAvailable: true, positions: [
      { symbol: 'AMZN', description: 'Amazon', kind: 'stock', units: 2, price: 100, costBasis: null, currency: 'USD', cashEquivalent: false },
      { symbol: 'SPAXX', description: 'Cash', kind: 'mutualfund', units: 200, price: 1, costBasis: null, currency: 'USD', cashEquivalent: true },
    ], cash: [{ currency: 'USD', amount: 100 }], warnings: [] },
    { institution: 'Robinhood', name: 'IRA', type: 'IRA', category: 'investment', status: 'open', reportedTotal: { amount: 2000, currency: 'USD' }, lastHoldingsSync: '2026-10-02T09:00:00Z', positionsAsOf: '2026-10-02T09:00:00Z', positionsAvailable: true, positions: [
      { symbol: 'AMZN', description: 'Amazon', kind: 'stock', units: 3, price: 110, costBasis: null, currency: 'USD', cashEquivalent: false },
      { symbol: 'QQQ', description: 'Nasdaq 100 ETF', kind: 'etf', units: 1, price: 200, costBasis: null, currency: 'USD', cashEquivalent: false },
      { symbol: 'CALL', description: 'Option', kind: 'option', units: 1, price: 25, costBasis: null, currency: 'USD', cashEquivalent: false },
    ], cash: [{ currency: 'USD', amount: 50 }], warnings: ['Account overlap across connections has not been verified.'] },
  ],
};

describe('connected portfolio bridge', () => {
  it('combines known USD holdings for the in-tab workspaces and marks partial coverage', () => {
    const result = connectedHoldings(snapshot);
    expect(result.holdings.scope).toContain('2 accounts');
    expect(result.holdings.totalValue).toBe(3000);
    expect(result.holdings.cashAvailable).toBe(150);
    expect(result.holdings.coverage).toBe('partial');
    expect(result.holdings.positions).toEqual([
      { symbol: 'AMZN', shares: 5, price: 106, kind: 'stock' },
      { symbol: 'QQQ', shares: 1, price: 200, kind: 'fund' },
    ]);
    expect(result.notes.some(note => note.includes('Account overlap'))).toBe(true);
  });

  it('requires reliable positive USD account totals before creating a combined view', () => {
    expect(() => connectedHoldings({ ...snapshot, accounts: [{ ...snapshot.accounts[0], reportedTotal: { amount: 100, currency: 'CAD' } }] })).toThrow('positive USD brokerage total');
  });
});

import { selectConnectedAccounts } from '../lib/connected-portfolio';
it('isolates a selected account and preserves retrieval and provider timestamps', () => {
  const selected = selectConnectedAccounts(snapshot, '1')!;
  expect(selected.retrievedAt).toBe(snapshot.retrievedAt);
  expect(selected.accounts[0].lastHoldingsSync).toBe(snapshot.accounts[1].lastHoldingsSync);
  const result = connectedHoldings(selected).holdings;
  expect(result.totalValue).toBe(2000);
  expect(result.cashAvailable).toBe(50);
  expect(result.scope).toBe('Robinhood · IRA');
  expect(result.positions.find(p => p.symbol === 'AMZN')?.shares).toBe(3);
  expect(snapshot.accounts).toHaveLength(2);
});
it('keeps all accounts selectable and rejects an unavailable account', () => {
  expect(selectConnectedAccounts(snapshot, 'all')).toBe(snapshot);
  expect(selectConnectedAccounts(null, 'all')).toBeNull();
  expect(() => selectConnectedAccounts(snapshot, '2')).toThrow('Choose an account');
  expect(() => selectConnectedAccounts(snapshot, '-1')).toThrow('Choose an account');
});
