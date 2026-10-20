'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { portfolioActionPlan } from '@/lib/action-plan';
import { dollars, percent, type Holdings } from '@/lib/holdings';
import { loadChecks } from '@/lib/watchlist';
import { loadArchive } from '@/lib/archive';
import type { QuickCheck } from '@/lib/quick-check';
import type { ResearchRun } from '@/lib/types';

export function PortfolioNextActions({
  holdings,
  title = 'Recommended next actions',
  maxItems = 6,
}: {
  holdings: Holdings;
  title?: string;
  maxItems?: number;
}) {
  const [checks, setChecks] = useState<Record<string, QuickCheck>>({});
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  useEffect(() => {
    let active = true;
    setChecks(loadChecks());
    void loadArchive().then(result => { if (active) setRuns(result.runs); });
    return () => { active = false; };
  }, []);

  const plan = portfolioActionPlan(holdings, checks, runs);
  const rows = plan.actions.slice(0, maxItems);

  return <section className="panel">
    <p className="eyebrow">DECISION QUEUE</p>
    <h2>{title}</h2>
    <p>Ranked from the current portfolio, concentration rules, recent saved research and fresh quick valuations. No trade is placed here.</p>
    {plan.blockers.map(blocker => <p className="warning" key={blocker}>{blocker}</p>)}
    <div className="holding-list">
      {rows.map(action => <article className="holding-row" key={action.symbol}>
        <div>
          <h3>{action.symbol} <small>{percent(action.weight)} · {dollars(action.valueUsd)}</small></h3>
          <strong>{action.label}</strong> <small>· {action.priority} · {action.evidence}</small>
          {action.amountUsd != null && <p><strong>Planning amount:</strong> about {dollars(action.amountUsd)}. This is a policy-sized comparison, not an order.</p>}
          <p>{action.reasons.join(' ')}</p>
          {action.taxContext && <p className="muted"><strong>Tax context:</strong> {action.taxContext}</p>}
          {action.blockers.map(blocker => <p className="muted" key={blocker}><strong>Before acting:</strong> {blocker}</p>)}
        </div>
        <div className="button-row">
          <Link className="action secondary" href={`/company/${encodeURIComponent(action.symbol)}`}>Review {action.symbol}</Link>
          <Link className="action secondary" href={`/compare?symbol=${encodeURIComponent(action.symbol)}`}>Compare change</Link>
        </div>
      </article>)}
    </div>
    {!rows.length && <p>No invested positions are available to rank.</p>}
    {plan.actions.length > maxItems && <p className="muted">Showing the top {maxItems} of {plan.actions.length} positions. Open Portfolio for the full holding list.</p>}
    <p className="muted">The queue does not yet have actual tax lots, wash-sale history, fund look-through or household liabilities. Those gaps stay visible rather than being guessed.</p>
  </section>;
}
