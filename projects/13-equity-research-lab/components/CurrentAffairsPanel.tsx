import React from 'react';
import type { ResearchRun } from '../lib/types';
import { currentAffairsStatus } from '../lib/current-affairs';

export function CurrentAffairsPanel({ run }: { run: ResearchRun }) {
  const ca = run.currentAffairs;
  return <section className="panel" aria-labelledby="current-affairs-heading">
    <p className="eyebrow">CURRENT AFFAIRS</p>
    <h2 id="current-affairs-heading">What changed recently?</h2>
    <p>{currentAffairsStatus(run)}</p>
    <p className="muted">Each event links to a source retrieved for this report and shows its publication and retrieval dates. Source membership shows provenance, not that the claim is true. Mechanisms are research interpretations, not proven causes of price moves.</p>
    {ca?.events.length ? <div className="two-col">{ca.events.map(e => <article key={e.rank} className={`event-card${e.stale ? ' stale' : ''}`}>
      <p className="eyebrow">{e.scope} · {e.evidenceKind}</p>
      <h3>{e.headline}</h3>
      <p><strong>Direction:</strong> {e.direction} · <strong>Uncertainty:</strong> {e.uncertainty}</p>
      <p><strong>How it could matter:</strong> {e.mechanism}</p>
      <p><small>Published {e.publishedDate}{e.eventDate ? ` · event ${e.eventDate}` : ''} · retrieved {e.retrievedAt.slice(0, 10)} · {e.ageDays} day{e.ageDays === 1 ? '' : 's'} before report{e.stale ? ' · stale' : ''}</small></p>
      <p><a href={e.source} target="_blank" rel="noopener noreferrer">{e.sourceTitle || e.sourceName}</a> <small>({e.sourceName}, tier {e.sourceTier})</small></p>
      {e.warnings.length > 0 && <p className="muted">{e.warnings.join(' ')}</p>}
    </article>)}</div> : <p>{ca ? 'No dated current-affairs evidence could be tied to the retrieved sources.' : 'This saved report predates current-affairs evidence. Its original conclusions are preserved. Generate a new full report to see it.'}</p>}
    {!!ca?.gaps.length && <><h3>Gaps</h3><ul>{ca.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul></>}
  </section>;
}
