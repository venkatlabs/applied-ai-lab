"use client";
import { loadWatchlist, saveWatchlist } from "./watchlist";

export type Followed = { symbol: string; source: "follow" | "holding" };
const valid = (t: string) => /^[A-Z][A-Z.\-]{0,9}$/.test(t);

/** Account list when available, merged with the older browser-only watchlist. */
export async function loadFollowed(): Promise<{ stocks: Followed[]; synced: boolean }> {
  const local = loadWatchlist().map(symbol => ({ symbol, source: "follow" as const }));
  try {
    const response = await fetch("/api/stocks", { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("unavailable");
    const { stocks } = await response.json() as { stocks: Followed[] };
    const known = new Set(stocks.map(s => s.symbol));
    const missing = local.filter(l => !known.has(l.symbol));
    if (missing.length) void saveFollowed(missing.map(m => m.symbol), "follow");
    return { stocks: [...stocks, ...missing], synced: true };
  } catch { return { stocks: local, synced: false }; }
}
export async function saveFollowed(symbols: string[], source: "follow" | "holding" = "follow"): Promise<boolean> {
  const list = [...new Set(symbols.map(s => s.trim().toUpperCase()).filter(valid))];
  if (!list.length) return true;
  if (source === "follow") saveWatchlist([...loadWatchlist(), ...list]);
  try {
    const response = await fetch("/api/stocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbols: list, source }) });
    return response.ok;
  } catch { return false; }
}
export async function removeFollowed(symbol: string): Promise<void> {
  saveWatchlist(loadWatchlist().filter(s => s !== symbol));
  try { await fetch("/api/stocks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol }) }); } catch { /* local copy already removed */ }
}
