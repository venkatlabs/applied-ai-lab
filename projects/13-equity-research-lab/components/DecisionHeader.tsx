import React from 'react';
import type { ResearchRun } from '../lib/types';
import { researchOutcome } from '../lib/outcome';
import { currentAffairsStatus } from '../lib/current-affairs';

export function DecisionHeader({ run }: { run: ResearchRun }) {
  const d = researchOutcome(run);
  return <header className="decision-header" aria-label="Decision summary">
    <div className="dh-main"><span className="dh-ticker">{run.ticker}</span><strong className="dh-action">{d.verdict}{d.confidence ? ` · ${d.confidence} confidence` : ''}</strong></div>
    <div className="dh-score" aria-label="Investment score">{d.score === null ? 'Not researched' : `${d.score}/100`}</div>
    <dl className="dh-facts">
      <div><dt>Analyzed</dt><dd>{run.analyzedAt.slice(0, 10)}</dd></div>
      <div><dt>Current affairs</dt><dd>{currentAffairsStatus(run)}</dd></div>
    </dl>
    <p className="dh-reason">{d.headline}</p>
  </header>;
}
