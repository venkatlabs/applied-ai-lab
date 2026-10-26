"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadRuns, saveRun } from "@/lib/archive";
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
      setStage(complete ? 'Seeking the missing evidence…' : 'Building the full report…');
      // One paid report per click. A second, automatic paid follow-up used to run here and doubled the cost; seeking missing
      // evidence is now its own explicit button on the report.
      const body = await request(complete, reportId);
      router.push(`/research/${encodeURIComponent(body.id)}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Research could not complete."); setBusy(false); }
  }
  async function quick() {
    setBusy(true); setError(''); setStage('Running the free screen…');
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker, tier: "light" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The quick screen could not complete.");
      saveRun(body as ResearchRun);
      router.push(`/research/${encodeURIComponent(body.id)}`);
    } catch (e) { setError(e instanceof Error ? e.message : "The quick screen could not complete."); setBusy(false); }
  }
  const blocked = !!budget?.reason;
  return <div className={compact ? undefined : "panel"}>
    {local && (!compact || error) && (!force || error) && <p>You already have today&apos;s report for {ticker}. <a href={`/research/${encodeURIComponent(local.id)}`}>Open it</a> without spending credits.</p>}
    <div className="button-row">
      <button disabled={busy || blocked} onClick={() => void run()}>{busy ? stage : complete ? `Seek missing ${ticker} evidence (paid)` : force ? `Run a fresh deep ${ticker} report (paid)` : `Deep research on ${ticker} (paid)`}</button>
      {!complete && !compact && <button className="action secondary" disabled={busy} onClick={() => void quick()}>Quick screen (free, no AI)</button>}
    </div>
    {!compact && <p className="muted">Deep research is the full AI report and uses paid credits and one daily slot. The quick screen uses filings and prices only, costs no AI credits and says whether a deep report is worth running. A missing valuation can remain blocked; the tool will not invent a Buy decision.</p>}
    {budget?.metered && <p className="muted">Live research budget today: {budget.remaining} of {budget.cap} new reports left (UTC day). Same-day reports are reused automatically.</p>}
    {budget?.reason && <p role="alert">{budget.reason}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
