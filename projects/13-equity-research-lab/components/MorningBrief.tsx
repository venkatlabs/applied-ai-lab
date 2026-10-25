'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { PrivatePortfolio } from './PortfolioPrivacy';
import type { Brief, BriefItem } from '@/lib/morning';

const cls = (v: string | null) => v === 'Buy / Add' ? 'v-buy' : v === 'Hold' ? 'v-hold' : v === 'Trim' ? 'v-trim' : v === 'Sell / Avoid' ? 'v-sell' : 'v-none';
const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const hide = <p className="muted">Portfolio percentages are hidden. Choose Show numbers to see how concentrated each stock is.</p>;

/** What was prepared overnight: fresh reports on the most concentrated holdings plus new names from other industries. */
export function MorningBrief() {
  const [brief, setBrief] = useState<Brief | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    fetch('/api/brief', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => { if (active) setBrief(d ? d.brief : null); }).catch(() => { if (active) setBrief(null); });
    return () => { active = false; };
  }, []);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  async function step(body: object): Promise<Brief> {
    const response = await fetch('/api/morning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'The brief could not be prepared.');
    return data.brief as Brief;
  }
  async function prepare() {
    if (busy) return;
    if (!window.confirm("Prepare the brief now? It researches your three most concentrated stocks and up to two new ideas, using up to 5 paid reports from today's budget (same-day reports are reused). It takes several minutes; keep this page open.")) return;
    setBusy(true); setError('');
    try {
      let current = await step({ step: 'plan' });
      setBrief(current);
      const todo = current.items.filter(i => i.status === 'pending').map(i => i.symbol);
      for (const [n, symbol] of todo.entries()) {
        setProgress(`Researching ${symbol} (${n + 1} of ${todo.length})… a few minutes each.`);
        current = await step({ step: 'research', symbol });
        setBrief(current);
        const done = current.items.find(i => i.symbol === symbol);
        if (done?.status === 'failed') { setError(`${symbol}: ${done.note ?? 'The analysis did not finish.'} Stopped to protect your research budget.`); break; }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'The brief could not be prepared.'); }
    finally { setBusy(false); setProgress(''); }
  }
  const action = <div className="button-row"><button className="action secondary" disabled={busy} onClick={() => void prepare()}>{busy ? 'Preparing…' : 'Prepare my brief now'}</button><span role="status" className="muted">{progress}</span></div>;
  const fail = error ? <p role="alert" className="warning">{error}</p> : null;
  if (brief === undefined) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (!brief) return <section className="panel morning"><p className="eyebrow">MORNING BRIEF</p><h2>Not prepared yet</h2><p className="muted">When morning research is switched on, a fresh report on your most concentrated stocks and a few new ideas will be waiting here by 7:30 each weekday. See docs/MORNING_PREP_2026-10-23.md. You can also prepare it now.</p>{action}{fail}</section>;
  const stale = brief.day !== today;
  const concentrated = brief.items.filter(i => i.role === 'concentrated'), discovery = brief.items.filter(i => i.role === 'discovery');
  return <section className="panel morning" aria-labelledby="morning-heading">
    <p className="eyebrow">MORNING BRIEF · PREPARED {when(brief.generatedAt).toUpperCase()}</p>
    <h2 id="morning-heading">{brief.summary}</h2>
    {stale && <p className="warning">This brief is from {brief.day}. Today&apos;s has not been prepared; check Watch → Job health.</p>}
    {brief.notes.length > 0 && <ul>{brief.notes.map((n, i) => <li key={i} className="muted">{n}</li>)}</ul>}
    <PrivatePortfolio placeholder={hide}>
      {brief.concentration && <div className="brief-concentration">
        {brief.concentration.flags.map((f, i) => <p key={i} className="warning">{f}</p>)}
        <p>Top 3 stocks: <strong>{brief.concentration.top3Pct}%</strong> of the portfolio · top 5: {brief.concentration.top5Pct}%{brief.concentration.clusters.map(c => ` · ${c.name}: ${c.weightPct}% (${c.symbols.join(', ')})`).join('')}</p>
      </div>}
    </PrivatePortfolio>
    <h3>Your most concentrated stocks</h3>
    {concentrated.length === 0 ? <p className="muted">None identified.</p> : concentrated.map(i => <BriefRow key={i.symbol} item={i} />)}
    {discovery.length > 0 && <><h3>New ideas from other industries</h3>{discovery.map(i => <BriefRow key={i.symbol} item={i} />)}</>}
    {action}{fail}
    <p className="muted">{brief.cost.reports} new report{brief.cost.reports === 1 ? '' : 's'}{brief.cost.estimatedUSD !== null ? ` · about $${brief.cost.estimatedUSD.toFixed(2)}` : ''}. Research output, not personal advice.</p>
  </section>;
}

function BriefRow({ item }: { item: BriefItem }) {
  const href = item.reportId ? `/research/${encodeURIComponent(item.reportId)}` : `/company/${encodeURIComponent(item.symbol)}`;
  return <article className="stock-row brief-row">
    <div className="stock-id"><h3><Link href={href}>{item.symbol}</Link> <small>{item.sector}</small></h3><p className="tags"><span className="tag">{item.status === 'researched' ? 'New report' : item.status === 'reused' ? "Today's report" : item.status === 'failed' ? 'Failed' : item.status === 'pending' ? 'Waiting' : 'Skipped'}</span>{item.changed && <span className="tag status-watch">Verdict changed</span>}</p></div>
    <div className="stock-verdict">{item.verdict ? <strong className={`verdict-badge ${cls(item.verdict)}`}>{item.verdict}</strong> : <strong className="verdict-badge v-none">No report</strong>}</div>
    <div className="stock-why">{item.lines.length ? <><p>{item.lines[0]}</p>{item.lines.length > 1 && <PrivatePortfolio placeholder={<p className="muted">Concentration details hidden.</p>}>{item.lines.slice(1).map((l, i) => <p key={i} className="muted">{l}</p>)}</PrivatePortfolio>}</> : <p className="muted">{item.note ?? 'No report was prepared.'}</p>}{item.note && item.lines.length > 0 && <p className="muted">{item.note}</p>}</div>
    <div className="button-row stock-actions"><Link className="action secondary" href={href}>{item.reportId ? 'Open report' : 'Research'}</Link></div>
  </article>;
}
