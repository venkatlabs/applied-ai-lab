import React from 'react';
import type { ResearchRun } from '../lib/types';
import { investmentDecision } from '../lib/decision';
import { currentAffairsStatus } from '../lib/current-affairs';

export function DecisionHeader({ run }: { run: ResearchRun }) {
  const d = investmentDecision(run);
  return <header className="decision-header" aria-label="Decision summary">
    <div className="dh-main"><span className="dh-ticker">{run.ticker}</span><strong className="dh-action">{d.action}</strong></div>
    <div className="dh-score" aria-label="Investment score">{d.score === null ? 'Not rated' : `${d.score}/100`}</div>
    <dl className="dh-facts">
      <div><dt>Analyzed</dt><dd>{run.analyzedAt.slice(0, 10)}</dd></div>
      <div><dt>Current affairs</dt><dd>{currentAffairsStatus(run)}</dd></div>
    </dl>
    <p className="dh-reason">{d.reason}</p>
  </header>;
}
