'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { stockActionSummary } from '@/lib/action-plan';
import { connectedHoldings } from '@/lib/connected-portfolio';
import { readHoldings, dollars, percent, type Holdings } from '@/lib/holdings';
import type { ResearchRun } from '@/lib/types';
import { usePortfolioSession } from './PortfolioSession';
import { PrivatePortfolio } from './PortfolioPrivacy';

function StockNextActionContent({ run }: { run: ResearchRun }) {
  const { snapshot } = usePortfolioSession();
  const [holdings, setHoldings] = useState<Holdings | null>(null);
  const [portfolioError, setPortfolioError] = useState('');

  useEffect(() => {
    setPortfolioError('');
    try {
      setHoldings(snapshot ? connectedHoldings(snapshot).holdings : readHoldings());
    } catch (error) {
      setHoldings(null);
      setPortfolioError(error instanceof Error ? error.message : 'Portfolio context is unavailable.');
    }
  }, [snapshot]);

  const action = stockActionSummary(run, holdings);

  return <section className="panel">
    <p className="eyebrow">FINAL NEXT STEP</p>
    <h2>{run.ticker}: {action.label}</h2>
    <p>This combines the research conclusion with the portfolio context currently available in this tab/browser. It is the final decision-support output, not a trade order.</p>

    {action.portfolioWeight != null && <p><strong>Current portfolio weight:</strong> {percent(action.portfolioWeight)}</p>}
    {action.amountUsd != null && <p><strong>Policy-sized change to review:</strong> about {dollars(action.amountUsd)}.</p>}
    {action.roomUsd != null && action.label === 'BUY / ADD CANDIDATE' && <p><strong>Room under the default position limit:</strong> about {dollars(action.roomUsd)} before fund overlap and taxes.</p>}

    <h3>Why</h3>
    <ul>{action.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>

    {action.taxContext && <p className="muted"><strong>Tax context:</strong> {action.taxContext}</p>}
    {action.blockers.length > 0 && <>
      <h3>Before acting</h3>
      <ul>{[...new Set(action.blockers)].map(blocker => <li key={blocker}>{blocker}</li>)}</ul>
    </>}
    {action.whatChanges && <p><strong>What would change the decision:</strong> {action.whatChanges}</p>}
    {portfolioError && <p className="muted">{portfolioError}</p>}

    <div className="button-row">
      <Link className="action secondary" href="/">Review portfolio</Link>
      {holdings?.positions.some(p => p.symbol === run.ticker && p.shares > 0) &&
        <Link className="action secondary" href={`/compare?symbol=${encodeURIComponent(run.ticker)}`}>Compare a position change</Link>}
    </div>
    <p className="muted">A real execution layer is deliberately separate. The portal should first prove that its recommendations are evidence-complete, tax-aware and useful before any trade can be drafted or submitted.</p>
  </section>;
}

export function StockNextAction({ run }: { run: ResearchRun }) {
  return <PrivatePortfolio placeholder={<section className="panel privacy-placeholder"><h2>Personalized next action is hidden</h2><p>Choose Show numbers to combine this stock report with your portfolio and see the final buy/hold/trim/sell-review candidate.</p></section>}>
    <StockNextActionContent run={run} />
  </PrivatePortfolio>;
}
