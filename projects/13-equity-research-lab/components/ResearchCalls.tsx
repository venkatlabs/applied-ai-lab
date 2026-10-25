'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { loadArchive } from '@/lib/archive';
import { loadChecks } from '@/lib/watchlist';
import { buildStockRows } from '@/lib/stock-list';
import type { ResearchRun } from '@/lib/types';

/** Each stock's latest research call, written automatically, with how it has done since. No manual entry. */
export function ResearchCalls({ onLog }: { onLog?: (symbol: string) => void }) {
  const [runs, setRuns] = useState<ResearchRun[] | null>(null);
  const [prices, setPrices] = useState<Record<string, { price: number; date: string }>>({});
  useEffect(() => {
    let active = true;
    setPrices(Object.fromEntries(Object.entries(loadChecks()).map(([k, c]) => [k, { price: c.price, date: c.priceDate ?? c.checkedAt }])));
    void loadArchive().then(r => { if (active) setRuns(r.runs); });
    return () => { active = false; };
  }, []);
  const rows = useMemo(() => runs ? buildStockRows({ owned: [], following: [], runs, prices }).filter(r => r.report && r.outcome.verdict !== 'Not researched') : [], [runs, prices]);
  const graded = rows.filter(r => r.sinceCall);
  const right = graded.filter(r => r.sinceCall!.right).length;
  if (!runs) return <p role="status">Loading your research calls…</p>;
  return <section className="panel">
    <p className="eyebrow">RESEARCH CALLS</p><h2>What the tool said, and how it has done</h2>
    <p>Every report records a dated verdict automatically. {graded.length ? `${right} of ${graded.length} calls with a later price have moved the way the verdict implied (price only, no benchmark; small samples are noise).` : 'Press “Update prices (free)” on My stocks to measure how calls have done since they were made.'}</p>
    {rows.length === 0 ? <p>No research yet. <Link href="/">Research your holdings</Link> to start your record.</p> :
      <div className="table-wrap"><table><thead><tr><th>Stock</th><th>Call</th><th>Made</th><th>Price then</th><th>Since the call</th><th></th></tr></thead>
        <tbody>{rows.map(r => <tr key={r.symbol}>
          <td><Link href={`/research/${encodeURIComponent(r.report!.id)}`}>{r.symbol}</Link></td>
          <td><strong>{r.outcome.verdict}</strong> · {r.outcome.confidence} confidence</td>
          <td>{r.report!.analyzedAt.slice(0, 10)}</td><td>${r.report!.asOfPrice.toFixed(2)}</td>
          <td>{r.sinceCall ? `${r.sinceCall.movePct > 0 ? '+' : ''}${r.sinceCall.movePct}% in ${r.sinceCall.days}d ${r.sinceCall.right ? '✓' : '✗'}` : 'Not measured yet'}</td>
          <td>{onLog && <button className="action secondary" onClick={() => onLog(r.symbol)}>Log what I did</button>}</td></tr>)}</tbody></table></div>}
  </section>;
}
