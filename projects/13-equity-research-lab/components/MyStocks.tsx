'use client';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePortfolioSession } from './PortfolioSession';
import { connectedHoldings } from '@/lib/connected-portfolio';
import { readHoldings } from '@/lib/holdings';
import { loadArchive, saveRun } from '@/lib/archive';
import { loadChecks, runChecks } from '@/lib/watchlist';
import { loadFollowed, removeFollowed, saveFollowed } from '@/lib/followed';
import { buildStockRows, researchQueue, summarize, type StockRow } from '@/lib/stock-list';
import type { ResearchRun } from '@/lib/types';

type Budget = { metered: boolean; remaining: number; cap: number; reason?: string };
const verdictClass = (v: string) => v === 'Buy / Add' ? 'v-buy' : v === 'Hold' ? 'v-hold' : v === 'Trim' ? 'v-trim' : v === 'Sell / Avoid' ? 'v-sell' : 'v-none';
const ago = (days: number | null) => days === null ? 'unknown date' : days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;

export function MyStocks() {
  const { snapshot } = usePortfolioSession();
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [following, setFollowing] = useState<string[]>([]);
  const [synced, setSynced] = useState(true);
  const [owned, setOwned] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, { price: number; date: string }>>({});
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [budget, setBudget] = useState<Budget | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const stop = useRef(false);

  const refreshPrices = useCallback(() => {
    setPrices(Object.fromEntries(Object.entries(loadChecks()).map(([k, c]) => [k, { price: c.price, date: c.priceDate ?? c.checkedAt }])));
  }, []);
  useEffect(() => {
    let active = true;
    refreshPrices();
    void loadArchive().then(r => { if (active) { setRuns(r.runs); setLoaded(true); } });
    void loadFollowed().then(r => { if (active) { setFollowing(r.stocks.map(s => s.symbol)); setSynced(r.synced); } });
    fetch('/api/research-budget', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(b => { if (active) setBudget(b); }).catch(() => undefined);
    return () => { active = false; };
  }, [refreshPrices]);
  useEffect(() => {
    try {
      const holdings = snapshot ? connectedHoldings(snapshot).holdings : readHoldings();
      const symbols = (holdings?.positions ?? []).filter(p => p.kind === 'stock' && p.shares > 0).map(p => p.symbol);
      setOwned(symbols);
      if (symbols.length) void saveFollowed(symbols, 'holding').then(ok => setSynced(s => s && ok));
    } catch { setOwned([]); }
  }, [snapshot]);

  const rows = useMemo(() => buildStockRows({ owned, following, runs, prices }), [owned, following, runs, prices]);
  const sum = useMemo(() => summarize(rows), [rows]);
  const remaining = budget ? (budget.metered || !budget.reason ? budget.remaining : 0) : 0;
  const queue = useMemo(() => researchQueue(rows, remaining), [rows, remaining]);

  async function add(e: FormEvent) {
    e.preventDefault();
    const symbols = input.toUpperCase().split(/[\s,;]+/).filter(t => /^[A-Z][A-Z.\-]{0,9}$/.test(t));
    if (!symbols.length) { setMessage('Enter one or more ticker symbols, such as NVDA or BRK-B.'); return; }
    setFollowing(f => [...new Set([...f, ...symbols])]); setInput('');
    setSynced(await saveFollowed(symbols, 'follow'));
    setMessage(`Following ${symbols.join(', ')}. Press Research on a row to get its verdict.`);
  }
  async function researchQueueNow() {
    if (!queue.length || busy) return;
    if (!window.confirm(`Research ${queue.length} stock${queue.length === 1 ? '' : 's'} you own (${queue.join(', ')})?\n\nEach uses one paid report from today's budget (${remaining} left). It stops if the budget runs out or an error occurs.`)) return;
    setBusy(true); stop.current = false; setMessage('');
    let done = 0;
    for (const ticker of queue) {
      if (stop.current) break;
      setProgress(`Researching ${ticker} (${done + 1} of ${queue.length})… this takes a few minutes.`);
      try {
        const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticker }) });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Research could not complete.');
        saveRun(body as ResearchRun);
        setRuns(prev => [body as ResearchRun, ...prev.filter(r => r.id !== body.id)]);
        done++;
      } catch (error) { setMessage(`${ticker}: ${error instanceof Error ? error.message : 'Research could not complete.'} Stopped after ${done} report${done === 1 ? '' : 's'}.`); break; }
    }
    setProgress(''); setBusy(false);
    if (done === queue.length) setMessage(`Done. ${done} stock${done === 1 ? '' : 's'} researched.`);
    void fetch('/api/research-budget', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(setBudget).catch(() => undefined);
  }
  async function updatePrices() {
    if (busy) return;
    setBusy(true); stop.current = false;
    await runChecks(rows.filter(r => r.outcome.verdict !== 'Not researched').map(r => r.symbol).slice(0, 25), setProgress, stop);
    refreshPrices(); setBusy(false);
  }

  return <section className="my-stocks" aria-labelledby="my-stocks-heading">
    <div className="hero compact"><div><p className="eyebrow">MY STOCKS</p><h1 id="my-stocks-heading">What should I do with each stock?</h1>
      <p className="lede">Every stock you own or follow, with one clear research verdict, how confident we are, and when it was last checked.</p></div></div>
    {!synced && <p className="warning" role="status">Your followed list is only saved in this browser right now. Sign in and check the database setup to keep it across devices.</p>}
    {loaded && <div className="scenario-grid stock-summary">
      <div className="metric"><strong>{sum.researched}/{sum.total}</strong><span>stocks with a verdict</span></div>
      <div className="metric"><strong>{sum.needResearch + sum.needRefresh}</strong><span>owned stocks need research or a refresh</span></div>
      <div className="metric"><strong>{sum.reduce}</strong><span>owned stocks flagged to trim or sell</span></div>
    </div>}
    <div className="toolbar stock-tools">
      <form className="ticker-search" onSubmit={e => void add(e)}><input aria-label="Add tickers to follow" placeholder="Add: NVDA, MSFT" value={input} onChange={e => setInput(e.target.value)} /><button type="submit">Follow</button></form>
      <button className="action" disabled={busy || !queue.length} onClick={() => void researchQueueNow()} title={queue.length ? '' : remaining ? 'Every stock you own already has a verdict' : 'No research budget left today'}>
        {busy && progress.startsWith('Researching') ? 'Researching…' : queue.length ? `Research ${queue.length} unresearched holding${queue.length === 1 ? '' : 's'}` : 'All holdings researched'}</button>
      <button className="action secondary" disabled={busy || !rows.some(r => r.outcome.verdict !== 'Not researched')} onClick={() => void updatePrices()}>Update prices (free)</button>
    </div>
    {budget?.metered && <p className="muted">Research budget today: {budget.remaining} of {budget.cap} new reports left (resets 00:00 UTC). {budget.reason ? budget.reason : ''}</p>}
    <p role="status">{progress || message}</p>
    {!loaded ? <p role="status">Loading your research…</p> : rows.length === 0
      ? <div className="panel"><h2>Start with your holdings</h2><p>Connect your accounts to bring in everything you own, or follow a ticker above.</p><div className="button-row"><Link className="action" href="/accounts">Connect accounts</Link><Link className="action secondary" href="/holdings">Import holdings</Link></div></div>
      : <div className="stock-list" role="list">{rows.map(row => <StockCard key={row.symbol} row={row} onRemove={async () => { setFollowing(f => f.filter(s => s !== row.symbol)); await removeFollowed(row.symbol); }} />)}</div>}
    <p className="muted">Verdicts are research outputs from the evidence available on the report date, not personal advice. Low confidence means key evidence is missing; the report lists what.</p>
  </section>;
}

function StockCard({ row, onRemove }: { row: StockRow; onRemove: () => void }) {
  const o = row.outcome;
  const href = row.report ? `/research/${encodeURIComponent(row.report.id)}` : `/company/${encodeURIComponent(row.symbol)}`;
  return <article className="stock-row" role="listitem">
    <div className="stock-id"><h3><Link href={href}>{row.symbol}</Link> <small>{row.companyName !== row.symbol ? row.companyName : ''}</small></h3>
      <p className="tags">{row.owned && <span className="tag">Owned</span>}{row.following && !row.owned && <span className="tag">Following</span>}{row.reportCount > 1 && <span className="tag">{row.reportCount} reports</span>}</p></div>
    <div className="stock-verdict"><strong className={`verdict-badge ${verdictClass(o.verdict)}`}>{o.verdict}</strong>
      {o.confidence && <span className="muted">{o.confidence} confidence · score {o.score}</span>}</div>
    <div className="stock-why"><p>{o.verdict === 'Not researched' ? o.headline : row.owned ? o.ownedAction : o.notOwnedAction}</p>
      <p className="muted">{o.analyzedAt ? `Researched ${ago(o.ageDays)}${o.needsRefresh ? ' · refresh recommended' : ''}` : 'Never researched'}
        {row.sinceCall && ` · since the call: ${row.sinceCall.movePct > 0 ? '+' : ''}${row.sinceCall.movePct}% in ${row.sinceCall.days} days ${row.sinceCall.right ? '✓' : '✗'}`}</p>
      {o.confidence === 'Low' && o.missing.length > 0 && <p className="muted">Missing: {o.missing.slice(0, 3).join('; ')}.</p>}</div>
    <div className="button-row stock-actions">
      <Link className={row.action === 'Open' ? 'action secondary' : 'action'} href={row.action === 'Open' ? href : `/company/${encodeURIComponent(row.symbol)}`}>{row.action === 'Open' ? 'Open report' : row.action === 'Refresh' ? 'Refresh research' : 'Research'}</Link>
      {row.following && !row.owned && <button className="action secondary" onClick={onRemove} aria-label={`Stop following ${row.symbol}`}>Unfollow</button>}
    </div>
  </article>;
}
