"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadRuns, saveRun } from "@/lib/archive";
import { completionState } from "@/lib/research-completion";
import type { ResearchRun } from "@/lib/types";

type Budget = { metered: boolean; used: number; cap: number; remaining: number; reason?: string };

/** Paid research starts only from an explicit click (POST). Page views never spend credits. */
export function RunResearch({ ticker, force = false, complete = false, reportId, compact = false }: { ticker: string; force?: boolean; complete?: boolean; reportId?: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [budget, setBudget] = useState<Budget | null>(null);
  const [local, setLocal] = useState<ResearchRun | null>(null);
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    setLocal(loadRuns().find(r => r.ticker === ticker && r.analyzedAt.startsWith(today) && r.score > 0) ?? null);
    if (!compact) fetch("/api/research-budget", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(setBudget).catch(() => {});
  }, [ticker, compact]);
  async function run() {
    setBusy(true); setError("");
    try {
      async function request(deepen: boolean, id?: string) {
        const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker, force: deepen ? false : force, complete: deepen, reportId: id }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Research could not complete.");
        saveRun(body as ResearchRun);
        return body as ResearchRun;
      }
      setStage(complete ? 'Seeking the missing valuation evidence…' : 'Building the full report…');
      let body = await request(complete, reportId);
      if (!complete && completionState(body).followUp) {
        setStage('Seeking missing evidence: one targeted follow-up…');
        try { body = await request(true, body.id); }
        catch (error) { setError(`The first report was saved. Follow-up stopped: ${error instanceof Error ? error.message : 'Research unavailable'}`); setBusy(false); setLocal(body); return; }
      }
      router.push(`/research/${encodeURIComponent(body.id)}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Research could not complete."); setBusy(false); }
  }
  const blocked = !!budget?.reason;
  return <div className={compact ? undefined : "panel"}>
    {local && (!compact || error) && (!force || error) && <p>You already have today&apos;s report for {ticker}. <a href={`/research/${encodeURIComponent(local.id)}`}>Open it</a> without spending credits.</p>}
    <button disabled={busy || blocked} onClick={() => void run()}>{busy ? stage : complete ? `Complete ${ticker} research` : force ? `Run a fresh ${ticker} report` : `Run ${ticker} research`}</button>
    {!compact && <p className="muted">Full research includes at most one targeted follow-up when evidence is missing. Each new report uses one daily budget slot. A missing valuation can remain blocked; the tool will not invent a Buy decision.</p>}
    {budget?.metered && <p className="muted">Live research budget today: {budget.remaining} of {budget.cap} new reports left (UTC day). Same-day reports are reused automatically.</p>}
    {budget?.reason && <p role="alert">{budget.reason}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
