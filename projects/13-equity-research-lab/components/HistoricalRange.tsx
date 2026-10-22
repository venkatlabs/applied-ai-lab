'use client';
import React, { useState } from 'react';
import type { HistoricalRange as Range } from '@/lib/price-simulation';
import type { ResearchRun } from '@/lib/types';
import { researchOutcome } from '@/lib/outcome';

const pct = (x: number) => `${Math.round(x * 100)}%`;
/** Free, on-demand: how this stock's own past monthly returns would have played out over 12 months. */
export function HistoricalRange({ run }: { run: ResearchRun }) {
  const [range, setRange] = useState<Range | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  if (run.dataMode === 'demo' || !(run.asOfPrice > 0)) return null;
  const outcome = researchOutcome(run);
  async function load() {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/simulation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker: run.ticker }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'History is unavailable.');
      setRange(body.range);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'History is unavailable.'); } finally { setBusy(false); }
  }
  const price = run.asOfPrice;
  return <section className="panel" aria-labelledby="range-heading">
    <p className="eyebrow">HISTORICAL RANGE</p><h2 id="range-heading">How wide has {run.ticker}&apos;s 12-month range been?</h2>
    <p className="muted">A data-based check next to the report&apos;s assumed scenarios. It uses this stock&apos;s own past monthly returns, costs no AI credits, and is not a forecast.</p>
    {!range && <button className="action" disabled={busy} onClick={() => void load()}>{busy ? 'Loading history…' : 'Show historical range (free)'}</button>}
    <p role="status">{message}</p>
    {range && <>
      <p>Based on {range.observations} monthly returns, {range.start.slice(0, 7)} to {range.end.slice(0, 7)} · past volatility {pct(range.annualVolatility)} a year · past annualized return {pct(range.annualizedReturn)}.</p>
      <div className="table-wrap"><table><thead><tr><th>Version</th><th>Typical (median)</th><th>Low (10th %)</th><th>High (90th %)</th><th>Chance of ≥ {pct(range.hurdle)} gain</th><th>Chance of any gain</th><th>Chance of ≥ {pct(range.bigLoss)} loss</th></tr></thead>
        <tbody>{range.results.map(r => <tr key={r.mode}><td>{r.mode}</td><td>${(price * r.p50).toFixed(2)}</td><td>${(price * r.p10).toFixed(2)}</td><td>${(price * r.p90).toFixed(2)}</td><td>{pct(r.chanceBeatsHurdle)}</td><td>{pct(r.chanceGain)}</td><td>{pct(r.chanceBigLoss)}</td></tr>)}</tbody></table></div>
      {outcome.weightedReturnPct !== null && <p>The report&apos;s assumption-weighted five-case return is {outcome.weightedReturnPct}%; the swings-only median is {Math.round((range.results[1].p50 - 1) * 100)}%. A large gap means the report is leaning on its own assumptions more than on how this stock has behaved.</p>}
      <ul>{range.notes.map((n, i) => <li key={i} className="muted">{n}</li>)}</ul>
    </>}
  </section>;
}
