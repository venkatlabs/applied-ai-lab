import React from 'react';
import type { ResearchRun } from '../lib/types';
import { scoreBreakdown } from '../lib/score-breakdown';

export function ScoreBreakdown({ run }: { run: ResearchRun }) {
  const b = scoreBreakdown(run);
  if (!b) return null;
  return <section className="panel" aria-labelledby="score-breakdown-heading">
    <p className="eyebrow">SCORE BREAKDOWN</p>
    <h2 id="score-breakdown-heading">How the score was built</h2>
    <div className="table-scroll"><table className="breakdown">
      <thead><tr><th>Factor</th><th>Rating</th><th>Points</th><th>Weight</th><th>Contribution</th><th>Evidence</th></tr></thead>
      <tbody>{b.rows.map(r => <tr key={r.key}>
        <th scope="row">{r.label}</th><td>{r.rating}</td><td>{r.points}</td><td>{Math.round(r.weight * 100)}%</td><td>{r.contribution.toFixed(1)}</td>
        <td>{r.status === 'Missing' ? 'Missing (neutral 50 used)' : `${r.evidenceDate}${r.ageDays !== null ? ` · ${r.ageDays}d old` : ''} · ${r.sources} source${r.sources === 1 ? '' : 's'}${r.stale ? ' · stale' : ''}`}</td>
      </tr>)}</tbody>
      <tfoot><tr><th scope="row" colSpan={4}>Weighted total</th><td>{b.weightedTotal}</td><td>{b.score === null ? 'Not rated' : `Score ${b.score}/100${b.capped ? ' (capped)' : ''}`}</td></tr></tfoot>
    </table></div>
    {b.capped && <p className="muted">The weighted total is capped because valuation evidence is missing; the score cannot reach a buy signal without it.</p>}
    {!b.available && b.missing.length > 0 && <p className="muted">Not rated: {b.missing.join('; ')}.</p>}
    <p className="muted">Ratings are model judgments; points and weights are fixed in code.</p>
  </section>;
}
