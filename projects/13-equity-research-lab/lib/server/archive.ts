import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { database } from "./supabase";
import { SESSION_COOKIE, accountOwnerHash, authConfig, readSession } from "./auth";
import type { ResearchRun } from "../types";

export function ownerHash(token?: string) {
  return token && /^[a-f0-9]{64}$/.test(token) ? createHash("sha256").update(token).digest("hex") : null;
}
export async function archiveContext() {
  const jar = await cookies();
  const cfg = authConfig();
  // A signed-in account owns its history across browsers; the anonymous cookie is only the legacy fallback.
  const session = await readSession(cfg, jar.get(SESSION_COOKIE)?.value);
  const owner = session ? await accountOwnerHash(session.sub) : cfg ? null : ownerHash(jar.get("research_workspace")?.value);
  const db = database();
  return owner && db ? { owner, db } : null;
}
/** Move a legacy anonymous workspace's rows onto an account. Possession of the 256-bit workspace token is the proof. */
export async function claimWorkspace(token: string | undefined, accountHash: string): Promise<number> {
  const legacy = ownerHash(token), db = database();
  if (!legacy || !db || legacy === accountHash) return 0;
  const { data, error } = await db.rpc("equity_claim_workspace", { old_hash: legacy, new_hash: accountHash });
  if (error) throw new Error("Could not attach earlier reports to this account.");
  return typeof data === "number" ? data : 0;
}
export async function saveSnapshot(run: ResearchRun): Promise<ResearchRun> {
  if (run.dataMode === "demo") return { ...run, storage: "browser" };
  try {
    const ctx = await archiveContext();
    if (!ctx) return { ...run, storage: "browser" };
    const saved = { ...run, storage: "cloud" as const };
    const { error } = await ctx.db.from("equity_snapshots").insert({
      id: run.id, owner_hash: ctx.owner, ticker: run.ticker, analyzed_at: run.analyzedAt, payload: saved,
    });
    if (error) return { ...run, storage: "unavailable" };
    return saved;
  } catch { return { ...run, storage: "unavailable" }; }
}
export async function readSnapshots(id?: string, trash = false): Promise<ResearchRun[]> {
  const ctx = await archiveContext();
  if (!ctx) throw new Error("Cloud archive is not configured for this browser.");
  let query = ctx.db.from("equity_snapshots").select("payload").eq("owner_hash", ctx.owner);
  query = trash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  if (id) query = query.eq("id", id);
  const { data, error } = await query.order("analyzed_at", { ascending: false }).limit(id ? 1 : 100);
  if (error) throw new Error("Cloud archive is temporarily unavailable. Browser copies are still available.");
  return (data ?? []).map(row => row.payload as ResearchRun);
}

export async function removedSnapshotIds(): Promise<string[]> {
  const ctx = await archiveContext();
  if (!ctx) return [];
  const { data, error } = await ctx.db.from("equity_snapshots").select("id").eq("owner_hash", ctx.owner).not("deleted_at", "is", null).limit(1000);
  if (error) throw new Error("Could not read archive state.");
  return (data ?? []).map(row => row.id);
}
export async function changeSnapshotVisibility(ids: string[], restore: boolean) {
  const ctx = await archiveContext();
  if (!ctx) throw new Error("Cloud archive unavailable.");
  const { data, error } = await ctx.db.from("equity_snapshots").update({ deleted_at: restore ? null : new Date().toISOString() }).eq("owner_hash", ctx.owner).in("id", ids).select("id");
  if (error) throw new Error("Cloud archive could not be updated. Try again.");
  return (data ?? []).map(row => row.id as string);
}

/** Latest saved report per ticker for this account, optionally limited to some symbols. */
export async function latestReports(symbols?: string[]): Promise<Record<string, ResearchRun>> {
  const ctx = await archiveContext();
  if (!ctx) return {};
  let q = ctx.db.from("equity_snapshots").select("payload").eq("owner_hash", ctx.owner).is("deleted_at", null);
  if (symbols?.length) q = q.in("ticker", symbols);
  const { data, error } = await q.order("analyzed_at", { ascending: false }).limit(300);
  if (error) return {};
  const out: Record<string, ResearchRun> = {};
  for (const row of data ?? []) { const run = row.payload as ResearchRun; if (run.dataMode !== "demo" && !out[run.ticker]) out[run.ticker] = run; }
  return out;
}
