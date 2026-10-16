import type { Holdings } from "./holdings";

export type ConnectedPosition = {
  symbol: string | null; description: string | null; kind: string | null;
  units: number | null; price: number | null; costBasis: number | null;
  currency: string | null; cashEquivalent: boolean;
};
export type ConnectedAccount = {
  institution: string; name: string | null; type: string | null; category: string | null;
  status: string | null; reportedTotal: { amount?: number | string | null; currency?: string | null } | null;
  lastHoldingsSync: string | null; positionsAsOf: string | null; positionsAvailable: boolean;
  positions: ConnectedPosition[] | null; cash: { currency: string | null; amount: number | null }[] | null;
  warnings: string[];
};
export type ConnectedSnapshot = { retrievedAt: string; excludedAccountCount: number; accounts: ConnectedAccount[] };
export type ConnectedHoldings = { holdings: Holdings; accountCount: number; includedSymbols: number; notes: string[] };

/** Convert a current, tab-only refresh into the saved-holdings shape used by the other workspaces. */
export function connectedHoldings(snapshot: ConnectedSnapshot): ConnectedHoldings {
  const notes: string[] = [];
  const totals = snapshot.accounts.map(a => money(a.reportedTotal?.amount));
  if (!snapshot.accounts.length || totals.some((v, i) => v === null || v <= 0 || snapshot.accounts[i].reportedTotal?.currency?.toUpperCase() !== "USD")) {
    throw new Error("To use this portfolio in other tools, every included account needs a positive USD brokerage total.");
  }
  const totalValue = totals.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  const positions = new Map<string, { shares: number; value: number; kind: "stock" | "fund" }>();
  let cashAvailable = 0;
  let partial = false;
  for (const account of snapshot.accounts) {
    if (!account.positionsAvailable || !account.positions) {
      partial = true;
      notes.push(`${account.institution} ${account.name ?? "account"}: holdings unavailable; this connected portfolio is partial.`);
    }
    if (account.warnings.length) { partial = true; notes.push(...account.warnings.map(w => `${account.institution}: ${w}`)); }
    if (!account.cash) { partial = true; notes.push(`${account.institution}: cash is unavailable and is not included.`); }
    else for (const balance of account.cash) {
      if (balance.currency?.toUpperCase() === "USD" && balance.amount !== null && Number.isFinite(balance.amount) && balance.amount >= 0) cashAvailable += balance.amount;
      else { partial = true; notes.push(`${account.institution}: a cash balance is missing, non-USD or invalid and is not included.`); }
    }
    for (const position of account.positions ?? []) {
      if (position.cashEquivalent) continue;
      const kind = position.kind?.toLowerCase();
      const portfolioKind = kind === "stock" || kind === "adr" ? "stock" : kind === "etf" || kind === "mutualfund" || kind === "cef" ? "fund" : null;
      const symbol = position.symbol?.trim().toUpperCase();
      if (!portfolioKind || !symbol || !/^[A-Z][A-Z.\-]{0,9}$/.test(symbol) || position.currency?.toUpperCase() !== "USD" ||
          position.units === null || position.price === null || !Number.isFinite(position.units) || !Number.isFinite(position.price) || position.units < 0 || position.price <= 0) {
        partial = true;
        continue;
      }
      const value = position.units * position.price;
      if (!Number.isFinite(value) || value < 0) { partial = true; continue; }
      const prior = positions.get(symbol);
      positions.set(symbol, { shares: (prior?.shares ?? 0) + position.units, value: (prior?.value ?? 0) + value, kind: portfolioKind });
    }
  }
  if (partial) notes.unshift("This view excludes unsupported or unavailable exposure. Treat all portfolio guidance as partial until account coverage is verified.");
  const normalized = [...positions.entries()].filter(([, p]) => p.shares > 0 && p.value > 0).map(([symbol, p]) => ({
    symbol, shares: p.shares, price: p.value / p.shares, kind: p.kind,
  }));
  const invested = normalized.reduce((sum, p) => sum + p.shares * p.price, 0);
  if (cashAvailable + invested > totalValue + 1) {
    notes.unshift("Known positions and cash exceed brokerage-reported account totals. Portfolio percentages may not be reliable; reconcile the account data first.");
    partial = true;
  } else if (totalValue - cashAvailable - invested > 1) {
    partial = true;
    notes.unshift("Part of the brokerage-reported total is not represented by priced positions or available cash; guidance uses the account total but that exposure is unknown.");
  }
  const date = snapshot.retrievedAt.slice(0, 10);
  const holdings: Holdings = {
    version: 1, scope: snapshot.accounts.length === 1 ? `${snapshot.accounts[0].institution} · ${snapshot.accounts[0].name ?? "Selected account"}` : `Connected ${[...new Set(snapshot.accounts.map(a => a.institution))].join(" + ")} (${snapshot.accounts.length} accounts)`,
    asOf: date, coverage: partial ? "partial" : "complete", totalValue, cashAvailable,
    positions: normalized,
  };
  return { holdings, accountCount: snapshot.accounts.length, includedSymbols: normalized.length, notes: [...new Set(notes)] };
}

function money(value: number | string | null | undefined): number | null {
  const parsed = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? parsed : null;
}

/** Scope the shared tab snapshot without changing its original refresh or provider dates. */
export function selectConnectedAccounts(snapshot: ConnectedSnapshot | null, selection: string): ConnectedSnapshot | null {
  if (!snapshot || selection === 'all') return snapshot;
  const index = Number(selection);
  if (!/^\d+$/.test(selection) || !Number.isInteger(index) || !snapshot.accounts[index]) throw new Error('Choose an account from this refresh.');
  return { ...snapshot, accounts: [snapshot.accounts[index]] };
}
