'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { selectConnectedAccounts, type ConnectedSnapshot } from '@/lib/connected-portfolio';

type SessionValue = { snapshot: ConnectedSnapshot | null; allAccounts: ConnectedSnapshot | null; selectedAccount: string; selectAccount: (account: string) => void; setSnapshot: (snapshot: ConnectedSnapshot) => void; clearSnapshot: () => void; refreshAccounts: () => Promise<void>; refreshing: boolean; refreshError: string };
const PortfolioSessionContext = createContext<SessionValue | null>(null);

export function PortfolioSessionProvider({ children }: { children: ReactNode }) {
  const [allAccounts, setCurrent] = useState<ConnectedSnapshot | null>(null);
  const [selectedAccount, selectAccount] = useState('all');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  function setSnapshot(next: ConnectedSnapshot) { setCurrent(next); selectAccount('all'); }
  async function refreshAccounts() {
    if (refreshing) return;
    setRefreshing(true); setRefreshError('');
    try {
      const response = await fetch('/api/snaptrade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Could not refresh connected accounts.');
      setSnapshot(body);
    } catch (error) { setRefreshError(error instanceof Error ? error.message : 'Could not refresh connected accounts.'); }
    finally { setRefreshing(false); }
  }
  const snapshot = useMemo(() => selectConnectedAccounts(allAccounts, selectedAccount), [allAccounts, selectedAccount]);
  const value = { snapshot, allAccounts, selectedAccount, selectAccount, setSnapshot, clearSnapshot: () => { setCurrent(null); selectAccount('all'); }, refreshAccounts, refreshing, refreshError };
  return <PortfolioSessionContext.Provider value={value}>{children}</PortfolioSessionContext.Provider>;
}

export function usePortfolioSession() {
  const value = useContext(PortfolioSessionContext);
  if (!value) throw new Error('Portfolio session provider is missing.');
  return value;
}
