import type { readPersonalPortfolio } from "./snaptrade-personal";
import type { ConnectedSnapshot } from "../connected-portfolio";

type PersonalSnapshot = Awaited<ReturnType<typeof readPersonalPortfolio>>;

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

/** The browser-safe shape of a brokerage read. Shared by the account refresh route and the morning job. */
export function toConnectedSnapshot(snapshot: PersonalSnapshot): ConnectedSnapshot & { source: "snaptrade" } {
  return {
    source: snapshot.source,
    retrievedAt: snapshot.retrievedAt,
    excludedAccountCount: snapshot.excludedAccountCount,
    accounts: snapshot.accounts.map(account => ({
      institution: account.institution,
      name: account.name,
      type: account.raw_type ?? null,
      category: account.account_category ?? null,
      status: account.status ?? null,
      reportedTotal: account.total,
      lastHoldingsSync: account.lastSync,
      positionsAsOf: account.positionsAsOf,
      positionsAvailable: account.positions !== null,
      positions: account.positions?.map(position => ({
        symbol: position.instrument?.symbol ?? null,
        description: position.instrument?.description ?? null,
        kind: position.instrument?.kind ?? null,
        units: numberOrNull(position.units),
        price: numberOrNull(position.price),
        costBasis: numberOrNull(position.cost_basis),
        currency: position.currency ?? null,
        cashEquivalent: position.cash_equivalent === true,
      })) ?? null,
      cash: account.cash,
      warnings: account.warnings,
    })),
  } as ConnectedSnapshot & { source: "snaptrade" };
}
