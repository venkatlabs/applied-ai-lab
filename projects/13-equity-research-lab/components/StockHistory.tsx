'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { loadArchive } from '@/lib/archive';
import { researchOutcome } from '@/lib/outcome';
import type { ResearchRun } from '@/lib/types';

/** Every saved report for one stock, newest first, so changes in the verdict are visible. */
export function StockHistory({ ticker, currentId }: { ticker: string; currentId?: string }) {
  const [runs, setRuns] = useState<ResearchRun[] | null>(null);
  useEffect(() => {
    let active = true;
    void loadArchive().then(r => { if (active) setRuns(r.runs.filter(x => x.ticker === ticker && x.dataMode !== 'demo').sort((a, b) => b.analyzedAt.localeCompare(a.analyzedAt))); });
    return () => { active = false; };
  }, [ticker]);
  if (!runs || runs.length < 2) return null;
  return <section className="panel stock-history" aria-labelledby="history-heading">
    <p className="eyebrow">HISTORY</p><h2 id="history-heading">{ticker}: how the verdict has changed</h2>
    <ol className="timeline">{runs.map((r, i) => {
      const o = researchOutcome(r, new Date(r.analyzedAt)), prev = runs[i + 1] ? researchOutcome(runs[i + 1], new Date(runs[i + 1].analyzedAt)) : null;
      return <li key={r.id}><span className="muted">{r.analyzedAt.slice(0, 10)}</span> · <strong>{o.verdict}</strong>{o.confidence ? ` (${o.confidence} confidence, score ${o.score})` : ''} · ${r.asOfPrice.toFixed(2)}
        {prev && prev.verdict !== o.verdict && <> · <em>changed from {prev.verdict}</em></>}
        {r.id === currentId ? <> · <span className="tag">this report</span></> : <> · <Link href={`/research/${encodeURIComponent(r.id)}`}>open</Link></>}</li>;
    })}</ol>
  </section>;
}
