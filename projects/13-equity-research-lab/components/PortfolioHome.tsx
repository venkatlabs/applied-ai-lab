'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePortfolioSession } from './PortfolioSession';
import { PrivatePortfolio } from './PortfolioPrivacy';
import { TickerSearch } from './TickerSearch';
import { connectedHoldings } from '@/lib/connected-portfolio';
import { readHoldings, dollars, percent, type Holdings } from '@/lib/holdings';
import { diversification } from '@/lib/diversification';
import { adviseHoldings } from '@/lib/position-advice';
import { loadChecks } from '@/lib/watchlist';
import { loadArchive } from '@/lib/archive';
import { thesisReviewStatus } from '@/lib/thesis-review';
import type { QuickCheck } from '@/lib/quick-check';
import type { ResearchRun } from '@/lib/types';

export function PortfolioHome() {
  const { snapshot } = usePortfolioSession();
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [checks, setChecks] = useState<Record<string, QuickCheck>>({});
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [limit, setLimit] = useState(10);
  useEffect(() => {
    setError(''); setNotes([]);
    try {
      if (snapshot) { const result = connectedHoldings(snapshot); setHoldings(result.holdings); setNotes(result.notes); }
      else setHoldings(readHoldings());
    } catch { setHoldings(null); setError('This snapshot could not be read. Review your accounts or import a valid snapshot.'); }
    setReady(true);
  }, [snapshot]);
  useEffect(() => {
    let active = true;
    setChecks(loadChecks());
    void loadArchive().then(result => { if (active) setRuns(result.runs); });
    return () => { active = false; };
  }, []);
  const limits = { singleStock: limit / 100, sector: .3 };
  const mix = holdings ? diversification(holdings, limits) : null;
  const advice = holdings ? adviseHoldings(holdings, checks, runs, limits) : [];
  const focus = mix?.positions.find(p => p.overLimit) ?? mix?.positions.find(p => p.value > 0);
  const latest = new Map<string, ResearchRun>();
  for (const run of runs) if (!latest.has(run.ticker) || latest.get(run.ticker)!.analyzedAt < run.analyzedAt) latest.set(run.ticker, run);
  const stale = holdings && (Date.now() - Date.parse(holdings.asOf)) / 86400000 > 7;
  return <div className="portfolio-home">
    <section className="hero compact"><div><p className="eyebrow">YOUR PORTFOLIO</p><h1>Your portfolio, your next move.</h1><p className="lede">Review what you own. See how an investment fits. Compare a change before deciding.</p></div></section>
    {!ready ? <p role="status">Loading your private snapshot…</p> : !holdings ? <section className="panel"><h2>Start with your holdings</h2><p>{error || 'Connect your accounts or import a snapshot to see your portfolio and concentration here.'}</p><div className="button-row"><Link className="action" href="/accounts">Set up accounts</Link><Link className="action secondary" href="/holdings">Import or enter holdings</Link></div><p className="muted">Account refresh is manual. Connected data stays in this tab and clears on reload; a saved snapshot stays in this browser.</p></section> : <PrivatePortfolio placeholder={<section className="panel"><h2>Your portfolio</h2><p className="portfolio-total" aria-label="Portfolio value hidden">••••••</p><p>Amounts, weights and concentration details are hidden.</p><div className="holding-list">{holdings.positions.filter(p => p.shares > 0).map(p => <article className="holding-row" key={p.symbol}><h3>{p.symbol}</h3><div className="button-row"><Link className="action secondary" href={latest.has(p.symbol) ? `/research/${encodeURIComponent(latest.get(p.symbol)!.id)}` : `/company/${encodeURIComponent(p.symbol)}`}>Review {p.symbol}</Link><Link className="action secondary" href={`/compare?symbol=${encodeURIComponent(p.symbol)}`}>Compare change</Link></div></article>)}</div></section>}>
      <div className="portfolio-source"><p>{holdings.scope} · snapshot {holdings.asOf} · {snapshot ? 'Connected for this tab' : 'Saved in this browser'}</p><Link href="/accounts">Data settings</Link></div>
      {stale && <p className="warning">This snapshot is over seven days old. Refresh or update it before deciding.</p>}
      {holdings.coverage === 'partial' && <p className="warning">Partial portfolio: some exposure or account overlap is unverified. Totals and guidance apply only to this snapshot.</p>}
      <div className="two-col"><section className="panel"><h2>Portfolio value</h2><strong className="portfolio-total">{dollars(holdings.totalValue)}</strong><div className="portfolio-mix" role="img" aria-label={`Stocks ${percent(mix!.stockWeight)}, funds ${percent(mix!.fundWeight)}, cash ${percent(mix!.cashWeight)}; remainder unclassified`}><span style={{ width: `${mix!.stockWeight * 100}%` }} /><span style={{ width: `${mix!.fundWeight * 100}%` }} /><span style={{ width: `${mix!.cashWeight * 100}%` }} /></div><p>Stocks {percent(mix!.stockWeight)} · funds {percent(mix!.fundWeight)} · cash {percent(mix!.cashWeight)}</p><p className="muted">Fund overlap and any unclassified remainder are not assessed.</p></section>
      <section className="panel"><h2>{mix!.verdict}</h2>{focus ? <><p><strong>{focus.symbol}: {percent(focus.weight)}</strong> of this portfolio. {focus.overLimit ? 'Compare reducing this position.' : 'Review its role before changing your mix.'}</p><Link className="action" href={`/compare?symbol=${encodeURIComponent(focus.symbol)}`}>Compare a change</Link></> : <p>No invested positions are recorded. Research an idea below.</p>}<label className="portfolio-limit">Your single-stock limit (%)<input type="number" min="1" max="100" value={limit} onChange={e => setLimit(Math.min(100, Math.max(1, Number(e.target.value) || 10)))} /></label><p className="muted">An editable planning limit, not a reason to sell a business.</p></section></div>
      <section className="panel"><div className="portfolio-source"><h2>What you own</h2><Link href="/holdings">Manage snapshot</Link></div><div className="holding-list">{advice.map(a => <article className="holding-row" key={a.symbol}><div><h3>{a.symbol} <small>{percent(a.weight)} · {dollars(a.value)}</small></h3><strong>{a.action === 'Hold (fund)' ? 'Review fund exposure' : a.action}</strong><p>{a.reasons.join(' ')}</p><p className="muted">{thesisReviewStatus(latest.get(a.symbol))}</p></div><div className="button-row"><Link className="action secondary" href={latest.has(a.symbol) ? `/research/${encodeURIComponent(latest.get(a.symbol)!.id)}` : `/company/${encodeURIComponent(a.symbol)}`}>Review {a.symbol}</Link><Link className="action secondary" href={`/compare?symbol=${encodeURIComponent(a.symbol)}`}>Compare change</Link></div></article>)}</div>{!advice.length && <p>No positive positions are recorded.</p>}<details><summary>Coverage and concentration details</summary><ul>{[...new Set([...notes, ...mix!.flags])].map(note => <li key={note}>{note}</li>)}</ul></details></section>
    </PrivatePortfolio>}
    <section className="panel"><h2>Would a new stock improve your portfolio?</h2><p>Open its investment case and compare adding or trimming against your holdings. Opening a stock does not run paid research.</p><TickerSearch /><div className="button-row"><Link href="/watchlist">Stocks you follow</Link><Link href="/opportunities">Discover candidates</Link></div><p className="muted">Full research runs only when requested, with daily caps. Fund overlap, tax lots and historical personal returns remain incomplete.</p></section>
  </div>;
}
