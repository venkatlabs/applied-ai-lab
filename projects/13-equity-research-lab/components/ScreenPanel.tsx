import React from 'react';
import type { ResearchRun } from '../lib/types';

/** Shown instead of a verdict when only the free quick screen has been run. */
export function ScreenPanel({ run }: { run: ResearchRun }) {
  if (run.tier !== 'light' || !run.screen) return null;
  const s = run.screen;
  return <section className="panel" aria-labelledby="screen-heading">
    <p className="eyebrow">QUICK SCREEN · NO AI USED</p>
    <h2 id="screen-heading">{s.label}</h2>
    <p>This is a free first look from filings, the quote, the modeled value and the peer multiple. It decides whether a paid deep report is worth running. It is not a rating, a score or a recommendation.</p>
    <ul>{s.signals.map(x => <li key={x.key}><strong>{x.label}:</strong> {x.score > 0 ? 'positive' : x.score < 0 ? 'concern' : 'neutral'}. {x.detail}</li>)}</ul>
    {s.missing.length > 0 && <p className="muted">Not available: {s.missing.join('; ')}.</p>}
    <p className="muted">{s.note}</p>
  </section>;
}
