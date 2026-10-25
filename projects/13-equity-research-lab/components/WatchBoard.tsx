'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { loadArchive } from '@/lib/archive';
import { latestByTicker } from '@/lib/outcome';
import { buildCalendar, dueForRefresh } from '@/lib/calendar';
import type { Digest } from '@/lib/digest';
import type { Trigger } from '@/lib/triggers';
import type { ResearchRun } from '@/lib/types';
import { useResearchRunner } from './ResearchRunner';

type Alert = { id: string; at: string; symbol: string; kind: string; direction: 'bull' | 'bear' | 'neutral'; headline: string; detail: string; read: boolean };
type LogRow = { id: string; at: string; symbol: string; change: string; goalpost: boolean; reason: string };
type Job = { kind: string; day: string; summary: string; ok: boolean };
const arrow = { bull: '▲', bear: '▼', neutral: '•' } as const;
const today = () => new Date().toISOString().slice(0, 10);

export function WatchBoard() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [log, setLog] = useState<LogRow[]>([]);
  const [digests, setDigests] = useState<{ week_ending: string; payload: Digest }[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [budget, setBudget] = useState<{ remaining: number; reason?: string } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  const load = useCallback(async () => {
    const [a, t, arch, b] = await Promise.all([
      fetch('/api/alerts', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/triggers', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
      loadArchive().catch(() => ({ runs: [] as ResearchRun[] })),
      fetch('/api/research-budget', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    setRuns(arch.runs); setBudget(b);
    if (!a || !t) { setState('unavailable'); return; }
    setAlerts(a.alerts); setLog(a.log); setDigests(a.digests); setJobs(a.runs ?? []); setTriggers(t.triggers); setState('ready');
  }, []);
  useEffect(() => { void load(); }, [load]);

  const latest = useMemo(() => latestByTicker(runs), [runs]);
  const reports = useMemo(() => Object.fromEntries([...latest.entries()]), [latest]);
  const calendar = useMemo(() => buildCalendar(triggers, reports, today()), [triggers, reports]);
  const due = useMemo(() => dueForRefresh(calendar, Object.fromEntries([...latest.entries()].map(([k, v]) => [k, v.analyzedAt]))), [calendar, latest]);
  const remaining = budget && !budget.reason ? budget.remaining : 0;
  const runner = useResearchRunner(report => setRuns(prev => [report, ...prev.filter(r => r.id !== report.id)]), () => void load());
  const attention = triggers.filter(t => t.status !== 'armed');
  const goalposts = log.filter(l => l.goalpost);
  const unread = alerts.filter(a => !a.read);

  async function markRead() {
    await fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: unread.slice(0, 100).map(a => a.id) }) });
    void load();
  }

  return <section className="watch-board">
    <div className="hero compact"><div><p className="eyebrow">WATCH</p><h1>What changed, and what is coming?</h1>
      <p className="lede">Prices are checked each trading day at no AI cost. Your pre-committed triggers, dated tests and the weekly digest are here. Nothing trades and nothing upgrades a verdict by itself.</p></div></div>
    {state === 'loading' && <p role="status">Loading…</p>}
    {state === 'unavailable' && <p className="warning" role="alert">Account storage is not available yet, so triggers and alerts cannot load. Sign in and run the database migrations (see HANDOFF).</p>}
    {state === 'ready' && <>
      <section className="panel"><h2>Needs attention {unread.length > 0 && <small>({unread.length} new)</small>}</h2>
        {attention.length === 0 && alerts.length === 0 ? <p>Nothing has tripped. Open a stock’s report and press “Start from this report” under Pre-committed triggers to begin.</p> : <>
          {attention.length > 0 && <ul className="trigger-list">{attention.map(t => <li key={t.id} className={`trigger ${t.status}`}><div><span className={`tag status-${t.status}`}>{t.status === 'tripped' ? 'Tripped' : 'On watch'}</span> <Link href={`/company/${encodeURIComponent(t.symbol)}`}>{t.symbol}</Link> · {t.kind === 'kill' ? 'Kill' : 'Upgrade'}: {t.text}<p className="muted">{t.evidence}</p></div></li>)}</ul>}
          {alerts.length > 0 && <ul className="alert-list">{alerts.slice(0, 20).map(a => <li key={a.id} className={a.read ? 'muted' : ''}><span aria-label={a.direction}>{arrow[a.direction]}</span> <strong>{a.headline}</strong> <small>{a.at.slice(0, 10)}</small>{a.detail && <p className="muted">{a.detail}</p>}</li>)}</ul>}
          {unread.length > 0 && <button className="action secondary" onClick={() => void markRead()}>Mark all read</button>}</>}</section>

      <section className="panel"><h2>Due for a refresh</h2>
        {due.length === 0 ? <p>No dated test has passed since your latest reports.</p> : <>
          <ul>{due.map(d => <li key={d.symbol}><Link href={`/company/${encodeURIComponent(d.symbol)}`}>{d.symbol}</Link>: {d.reason}</li>)}</ul>
          <button className="action" disabled={runner.busy || !remaining} onClick={() => void runner.run(due.map(d => d.symbol).slice(0, Math.min(5, remaining)), remaining, 'a dated test has passed')}>{runner.busy ? 'Researching…' : `Refresh ${Math.min(due.length, 5, remaining)} stock${Math.min(due.length, 5, remaining) === 1 ? '' : 's'}`}</button>
          <p className="muted">Paid research runs only when you press this, one report each, within today’s budget{budget ? ` (${remaining} left)` : ''}.</p></>}
        <p role="status">{runner.progress || runner.message}</p></section>

      <section className="panel"><h2>Calendar: next 8 weeks</h2>
        {calendar.overdue.length > 0 && <><h3>Overdue</h3><ul>{calendar.overdue.map((i, n) => <li key={n}>{i.date} · <Link href={`/company/${encodeURIComponent(i.symbol)}`}>{i.symbol}</Link> · {i.kind}: {i.label}</li>)}</ul></>}
        {calendar.weeks.length === 0 ? <p>No dated tests are scheduled. Add a test date to a trigger.</p> : calendar.weeks.map(w => <div key={w.weekStart}><h3>Week of {w.weekStart}</h3><ul>{w.items.map((i, n) => <li key={n}>{i.date} · <Link href={`/company/${encodeURIComponent(i.symbol)}`}>{i.symbol}</Link> · {i.kind}: {i.label}</li>)}</ul></div>)}</section>

      <section className="panel"><h2>Weekly digest</h2>
        {digests.length === 0 ? <p>The first digest is written on Sunday.</p> : digests.slice(0, 3).map(d => <article key={d.week_ending}><h3>Week ending {d.week_ending}</h3><p>{d.payload.headline}</p>
          {d.payload.tripped.length > 0 && <><strong>Tripped</strong><ul>{d.payload.tripped.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
          {d.payload.watch.length > 0 && <><strong>On watch</strong><ul>{d.payload.watch.map((x, i) => <li key={i}>{x}</li>)}</ul></>}
          {d.payload.verdictChanges.length > 0 && <><strong>Verdict changes</strong><ul>{d.payload.verdictChanges.map((v, i) => <li key={i}>{v.symbol}: {v.from} → {v.to}</li>)}</ul></>}
          {d.payload.upcoming.length > 0 && <><strong>Next two weeks</strong><ul>{d.payload.upcoming.map((u, i) => <li key={i}>{u.date} · {u.symbol}: {u.label}</li>)}</ul></>}</article>)}</section>

      <section className="panel"><h2>Goalpost log</h2>
        {goalposts.length === 0 ? <p>No kill trigger has been loosened or removed.</p> : <ul>{goalposts.map(g => <li key={g.id} className="goalpost"><strong>{g.symbol}</strong> · {g.at.slice(0, 10)} · {g.change}: {g.reason}</li>)}</ul>}
        <p className="muted">Loosening, extending or removing a kill trigger is allowed, but always logged here so a thesis cannot quietly drift.</p></section>

      <section className="panel"><h2>Job health</h2>
        {jobs.length === 0 ? <p>No scheduled job has run yet. Set <code>CRON_SECRET</code> in Vercel and redeploy to turn on the daily check.</p> : <ul>{jobs.map((j, i) => <li key={i}>{j.day} · {j.kind}: {j.ok ? '' : 'FAILED · '}{j.summary}</li>)}</ul>}</section>
    </>}
  </section>;
}
