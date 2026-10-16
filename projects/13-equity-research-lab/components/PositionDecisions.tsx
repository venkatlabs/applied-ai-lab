'use client';
import Link from 'next/link';
import { thesisReviewStatus } from '@/lib/thesis-review';
import { useEffect, useRef, useState } from 'react';
import { adviseHoldings } from '@/lib/position-advice';
import { loadChecks, runChecks } from '@/lib/watchlist';
import { loadArchive } from '@/lib/archive';
import { dollars, percent, type Holdings } from '@/lib/holdings';
import type { QuickCheck } from '@/lib/quick-check';
import type { ResearchRun } from '@/lib/types';
import { DecisionJournal } from './DecisionJournal';

export function PositionDecisions({ holdings, limit }: { holdings: Holdings; limit?: number }) {
  const [checks, setChecks] = useState<Record<string, QuickCheck>>({});
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const stop = useRef(false);
  useEffect(() => { setChecks(loadChecks()); void loadArchive().then(r => setRuns(r.runs)); }, []);
  if (!(holdings.totalValue > 0) || !holdings.positions.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const stocks = holdings.positions.filter(p => p.kind === 'stock' && p.shares > 0).map(p => p.symbol);
  const unchecked = stocks.filter(s => !checks[s]?.checkedAt.startsWith(today));
  const latest = new Map<string, ResearchRun>();
  for (const run of runs) {
    if (!latest.has(run.ticker) || latest.get(run.ticker)!.analyzedAt < run.analyzedAt) latest.set(run.ticker, run);
  }
  const advice = adviseHoldings(holdings, checks, runs, limit ? { singleStock: limit, sector: 0.3 } : undefined);
  return <><section className="panel">
    <p className="eyebrow">POSITION DECISIONS</p><h2>Hold, add or trim — one line per holding</h2>
    <p>Rules, in priority order: concentration against your single-stock limit, then a full report from the last 30 days, then the AI-free quick-check valuation. Add your average cost to see the tax effect of trimming.</p>
    <div className="button-row"><button disabled={busy || !unchecked.length} onClick={async () => { setBusy(true); stop.current = false; await runChecks(unchecked, m => { setMessage(m); setChecks(loadChecks()); }, stop); setChecks(loadChecks()); setBusy(false); }}>{busy ? 'Checking…' : `Quick-check ${unchecked.length} holding${unchecked.length === 1 ? '' : 's'} (no AI credits)`}</button></div>
    <p role="status">{message}</p>
    <div className="table-wrap"><table><thead><tr><th>Holding</th><th>Weight</th><th>Decision</th><th>Amount</th><th>Why</th><th>Investment review</th></tr></thead>
      <tbody>{advice.map(a => <tr key={a.symbol}><td><Link href={`/company/${encodeURIComponent(a.symbol)}`}>{a.symbol}</Link><br /><small>{dollars(a.value)}{a.unrealizedGainPct != null ? ` · ${a.unrealizedGainPct > 0 ? '+' : ''}${a.unrealizedGainPct}% vs cost` : ''}</small></td><td>{percent(a.weight)}</td><td><strong>{a.action}</strong>{a.zone ? <><br /><small>{a.zone}</small></> : null}</td><td>{a.amount != null ? `≈ ${dollars(a.amount)}` : '—'}</td><td><small>{a.reasons.join(' ')}</small></td><td><small>{thesisReviewStatus(latest.get(a.symbol))}</small>{latest.has(a.symbol) && <><br /><Link href={`/research/${encodeURIComponent(latest.get(a.symbol)!.id)}`}>Open saved checks</Link></>}</td></tr>)}</tbody></table></div>
    <p className="muted">A research aid using transparent policy rules, not personalized financial advice. Taxes, your time horizon and goals are not modelled here — use the Portfolio Lab or Diversify a holding workspace to compare staged selling.</p>
  </section><details className="panel"><summary>Decision journal (optional)</summary><DecisionJournal suggestions={Object.fromEntries(advice.map(a => [a.symbol, a.action]))} /></details></>;
}
