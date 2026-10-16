"use client";
import { useEffect, useMemo, useState } from "react";
import { loadArchive } from "@/lib/archive";
import { outcomes, summary } from "@/lib/track-record";
import type { ResearchRun } from "@/lib/types";

const pct = (x: number | null) => x === null ? "—" : `${(x * 100).toFixed(0)}%`;

export default function Performance() {
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  useEffect(() => { loadArchive().then(result => setRuns(result.runs)); }, []);
  const unique = useMemo(() => new Set(runs.map(r => r.ticker)).size, [runs]);
  const rows = useMemo(() => outcomes(runs), [runs]);
  const stats = useMemo(() => summary(rows), [rows]);
  return <section>
    <p className="eyebrow">RETROSPECTIVE ENGINE</p><h1>Prediction performance</h1>
    <p className="lede">Each frozen report is graded against the verified price in a later saved report of the same company, about 30, 90, 180 or 365 days on. The original thesis is never rewritten, and no extra data or API credits are used.</p>
    <div className="scenario-grid"><div className="metric"><strong>{runs.length}</strong><span>snapshots</span></div><div className="metric"><strong>{unique}</strong><span>companies</span></div><div className="metric"><strong>{rows.length}</strong><span>measured outcomes</span></div></div>
    <div className="table-wrap"><table><thead><tr><th>Horizon</th><th>Measured</th><th>Buy/avoid calls graded</th><th>Direction hit rate</th><th>Price moved toward intrinsic value</th></tr></thead>
      <tbody>{stats.map(s => <tr key={s.horizon}><td>{s.horizon} days</td><td>{s.measured}</td><td>{s.graded}</td><td>{pct(s.hitRate)}</td><td>{pct(s.towardIntrinsicRate)}</td></tr>)}</tbody></table></div>
    {rows.length === 0
      ? <div className="panel"><h2>No outcomes yet</h2><p>An outcome appears once the same company has two saved live reports roughly 30+ days apart. Re-run research on companies you follow each month to build the record.</p></div>
      : <div className="table-wrap"><table><thead><tr><th>Report</th><th>Call</th><th>Horizon</th><th>Price return</th><th>Verdict</th></tr></thead>
        <tbody>{rows.slice(0, 100).map(o => <tr key={`${o.reportId}-${o.horizon}`}><td><a href={`/research/${encodeURIComponent(o.reportId)}`}>{o.ticker} · {o.analyzedAt.slice(0, 10)}</a></td><td>{o.action}{o.score !== null ? ` (${o.score})` : ""}</td><td>{o.days}d</td><td>{o.priceReturnPct > 0 ? "+" : ""}{o.priceReturnPct.toFixed(1)}%</td><td>{o.verdictCorrect === null ? "Not directional" : o.verdictCorrect ? "Correct direction" : "Wrong direction"}</td></tr>)}</tbody></table></div>}
    <p className="muted">Limits: price return only (dividends and a market benchmark are excluded), measured only where you happened to re-run research, and small samples are noise. Treat this as an audit trail, not proof of skill. For a longer history, <a href="/backtest">backtest the valuation zones</a>.</p>
  </section>;
}
