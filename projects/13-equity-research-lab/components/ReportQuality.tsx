import React from 'react';
import type { ResearchRun } from '../lib/types';
import { reportQuality } from '../lib/report-quality';

export function ReportQuality({ run }: { run: ResearchRun }) {
  if (run.dataMode === 'demo') return null;
  const q = reportQuality(run);
  return <details className="panel report-quality">
    <summary>How well is this report sourced?</summary>
    <p><strong>Source coverage:</strong> {q.citationCoverage.pct === null ? 'nothing to measure on this older report' : `${q.citationCoverage.cited} of ${q.citationCoverage.total} claims (${q.citationCoverage.pct}%) are tied to a source retrieved for this report`}.</p>
    {q.citationCoverage.uncited.length > 0 && <ul>{q.citationCoverage.uncited.map((u, i) => <li key={i}>{u}</li>)}</ul>}
    <p><strong>Date checks:</strong> {q.dateIssues.length === 0 ? 'no inconsistencies found between evidence dates and source dates.' : `${q.dateIssues.length} to review.`}</p>
    {q.dateIssues.length > 0 && <ul>{q.dateIssues.map((d, i) => <li key={i}>{d.where}: {d.detail}</li>)}</ul>}
    <p><strong>Cost and time:</strong> {q.cost ? `${q.cost.estimatedUSD !== null ? `about $${q.cost.estimatedUSD.toFixed(2)}` : 'cost not fully recorded'}${q.cost.seconds !== null ? ` · ${q.cost.seconds}s` : ''} · ${q.cost.attempts} model call${q.cost.attempts === 1 ? '' : 's'}` : 'not recorded for this report'} · {q.version}</p>
    <p className="muted">A source being among this report&apos;s retrieved sources shows where a claim came from. It does not prove the claim is true.</p>
  </details>;
}
