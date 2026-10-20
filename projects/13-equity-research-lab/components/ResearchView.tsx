import { ScenarioDistribution } from "./ScenarioDistribution";
import { RunResearch } from "./RunResearch";
import { completionState } from "@/lib/research-completion";
import { ThesisReviewPanel } from "./ThesisReviewPanel";
import { PeerValuationPanel } from "./PeerValuationPanel";
import { HoldingAdjustment } from "./HoldingAdjustment";
import { ReportTools } from "./ReportTools";
import type { ResearchRun } from "@/lib/types";

import { ExecutiveSummary } from "./ExecutiveSummary";
import { StockHistory } from "./StockHistory";
import { StockTriggers } from "./StockTriggers";
import { DecisionHeader } from "./DecisionHeader";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { CurrentAffairsPanel } from "./CurrentAffairsPanel";
import { InvestmentChoices } from "./InvestmentChoices";
import { GroundingPanel } from "./GroundingPanel";
import { SnapshotRecorder } from "./SnapshotRecorder";
import { IntrinsicValuePanel } from "./IntrinsicValuePanel";
import { StockNextAction } from "./StockNextAction";

function utcLabel(iso?: string) {
  if (!iso) return null;
  return iso.replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC");
}

function moneyBillions(value?: number) {
  return value == null ? "—" : `$${(value / 1e9).toFixed(1)}B`;
}

export function ResearchView({ run }: { run: ResearchRun }) {
  const calibrated = run.scenarios.some(s => s.valuationMethod?.includes("price-anchored")) || /^equity-research-v0\.[56]\./.test(run.skillVersion);
  const hasScores = !!run.investmentCase || (run.score > 0 && run.confidence > 0);
  const intrinsic = run.scenarios.some(s => s.valuationMethod?.includes("intrinsic value"));
  return <>
    <SnapshotRecorder run={run} />
    <section className="hero compact">
      <div>
        <p className="eyebrow">{run.ticker} · {run.dataMode.toUpperCase()} DATA · {run.skillVersion}</p>
        <h1>{run.companyName}</h1>
        <p>
          {run.asOfPrice > 0 ? <>Market price <strong>${run.asOfPrice.toFixed(2)}</strong>{run.marketAsOf ? <> · {run.priceTiming === "end-of-day" ? "end-of-day price dated" : "market timestamp"} {run.priceTiming === "end-of-day" ? run.marketAsOf : utcLabel(run.marketAsOf)}{run.priceSource ? ` · ${run.priceSource}` : ""}</> : null}<br /></> : null}
          Research generated {utcLabel(run.analyzedAt)}
        </p>
      </div>
    </section>

    {run.dataMode === "demo" && <div className="warning"><strong>Demo mode.</strong> Placeholder scores are for product development only, not an investment decision.</div>}
    {run.dataMode !== "demo" && !hasScores && <div className="warning"><strong>Live-data mode, incomplete analysis.</strong> The app did not substitute demo scores when a provider or AI synthesis failed. Check Research notes below.</div>}

    {run.dataMode !== 'demo' && <section className="panel"><h2>Research completion</h2><p>{completionState(run).note}</p>{completionState(run).status === 'evidence blocked' && <ul>{completionState(run).gaps.map(gap=><li key={gap}>{gap}</li>)}</ul>}{completionState(run).followUp && <RunResearch ticker={run.ticker} complete reportId={run.id} />}</section>}
    <DecisionHeader run={run} />
    <ExecutiveSummary run={run} />
    <ScoreBreakdown run={run} />
    <CurrentAffairsPanel run={run} />
    <StockHistory ticker={run.ticker} currentId={run.id} />
    <ScenarioDistribution key={run.id} run={run} />
    <ThesisReviewPanel run={run} />
    {run.dataMode !== "demo" && <StockTriggers ticker={run.ticker} />}
    <PeerValuationPanel run={run} />
    <HoldingAdjustment ticker={run.ticker} />
    <ReportTools run={run} />
    <GroundingPanel run={run} />
    <InvestmentChoices run={run} />
    <details className="panel"><summary>Financial details, scenarios and provider notes</summary>

    {run.annualFinancials && <section className="panel">
      <h2>Verified annual financials</h2>
      <p className="muted">{run.annualFinancials.form ?? "SEC filing"} · period ended {run.annualFinancials.periodEnd}{run.annualFinancials.filedAt ? ` · filed ${run.annualFinancials.filedAt}` : ""}. USD; reported figures, not normalized earnings or a valuation.</p>
      <div className="table-wrap"><table><thead><tr><th>Metric</th><th>Reported amount</th></tr></thead><tbody>{([
        ["Revenue", run.annualFinancials.revenue], ["Net income / loss", run.annualFinancials.netIncome],
        ["Operating cash flow", run.annualFinancials.operatingCashFlow], ["Cash capital expenditures", run.annualFinancials.capitalExpenditures],
        ["Operating cash flow minus cash capex", run.annualFinancials.freeCashFlow],
      ] as const).map(([label, value]) => <tr key={label}><td>{label}</td><td>{value == null ? "Unavailable" : `${value < 0 ? "−" : ""}$${(Math.abs(value) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`}</td></tr>)}</tbody></table></div>
      <p className="muted">Source: SEC company facts below. Annual figures can differ substantially from current operating conditions. Quarterly evidence may be unavailable for foreign filers.</p>
    </section>}

    <div className="two-col">
      <section className="panel"><h2>Expectation gap</h2><p>{run.expectationGap}</p><h3>Valuation</h3><p>{run.valuationSummary}</p></section>
      <section className="panel"><h2>Catalysts</h2>{run.catalysts.length ? <ul>{run.catalysts.map(x => <li key={x}>{x}</li>)}</ul> : <p className="muted">Not available.</p>}<h3>Risks</h3>{run.risks.length ? <ul>{run.risks.map(x => <li key={x}>{x}</li>)}</ul> : <p className="muted">Not available.</p>}</section>
    </div>

    {run.reverseDcf && <section className="panel">
      <h2>Reverse DCF · what must the price be assuming?</h2>
      {run.reverseDcf.available ? <>
        <p>At the current market capitalization of <strong>{moneyBillions(run.reverseDcf.marketCap)}</strong>, a simplified cash-flow model requires roughly <strong>{((run.reverseDcf.impliedFcfGrowth ?? 0) * 100).toFixed(1)}% annual FCF growth</strong> for {run.reverseDcf.explicitYears} years from a base of {moneyBillions(run.reverseDcf.baseFreeCashFlow)}.</p>
        <p className="muted">Assumptions: {((run.reverseDcf.discountRate ?? 0) * 100).toFixed(0)}% discount rate · {((run.reverseDcf.terminalGrowth ?? 0) * 100).toFixed(0)}% terminal growth. {run.reverseDcf.note}</p>
      </> : <p className="muted">{run.reverseDcf.note}</p>}
    </section>}

    {run.intrinsicValuation && <IntrinsicValuePanel v={run.intrinsicValuation} price={run.asOfPrice} />}
    {run.scenarios.length > 0 && <section><h2>{intrinsic ? "Intrinsic value: bear / base / bull" : `12-month bull / base / bear${calibrated ? " sensitivity" : ""}`}</h2>{calibrated && <p className="muted">Price-anchored stress tests, not independent fair-value forecasts. Base is neutral by construction. Weights are illustrative; returns exclude dividends.</p>}<div className="scenario-grid">{run.scenarios.map(s => <article className="panel" key={s.label}><p className="eyebrow">{s.label} · {s.probability}% weight</p><h3>${s.fairValue.toFixed(2)}</h3><p><strong>{s.returnPct != null ? `${s.returnPct > 0 ? "+" : ""}${s.returnPct.toFixed(1)}% ${intrinsic ? "vs today's price" : "price return"}` : ""}</strong></p><ul>{s.thesis.map(x => <li key={x}>{x}</li>)}</ul>{s.assumptions?.length ? <><p className="muted"><strong>{s.valuationMethod}</strong></p><ul>{s.assumptions.map(x => <li key={x} className="muted">{x}</li>)}</ul></> : null}</article>)}</div></section>}

    {run.thesisKillers.length > 0 && <section className="panel"><h2>What would make us change our mind?</h2><ul>{run.thesisKillers.map(x => <li key={x}>{x}</li>)}</ul></section>}

    <section><h2>Analyst intelligence</h2><p>{run.analystSummary}</p>
      {run.analysts.length > 0 ? <div className="table-wrap"><table><thead><tr><th>Analyst</th><th>Firm</th><th>Rating</th><th>Target</th><th>Success</th><th>Avg return</th></tr></thead><tbody>{run.analysts.map((a, i) => <tr key={`${a.analyst}-${i}`}><td>{a.analyst}</td><td>{a.firm}</td><td>{a.rating}</td><td>{a.priceTarget ? `$${a.priceTarget.toFixed(2)}` : "—"}</td><td>{a.successRate != null ? `${a.successRate}%` : "—"}</td><td>{a.averageReturn != null ? `${a.averageReturn}%` : "—"}</td></tr>)}</tbody></table></div>
      : <p className="muted">Individual analyst identities/track records are unavailable on the current data plan. Aggregated estimates and consensus data may still be used by the AI synthesis.</p>}
    </section>

    {run.optionIdeas.length > 0 && <section><h2>Options decision frame</h2><p className="muted">No specific option contract is recommended without a live chain, Greeks, IV and liquidity data.</p><div className="scenario-grid">{run.optionIdeas.map(o => <article className="panel" key={o.strategy}><p className="eyebrow">FIT: {o.fit}</p><h3>{o.strategy}</h3><p>{o.rationale}</p><small>Max loss: {o.maxLoss} · Capital: {o.capitalProfile} · IV: {o.volatilityView}</small></article>)}</div></section>}

    <section className="panel"><h2>Sources</h2>{run.citations.length ? <ol>{run.citations.map((c, i) => <li key={`${c.url}-${i}`}><a href={c.url} target="_blank" rel="noreferrer">{c.title}</a> <span className="muted">— {c.source}, tier {c.tier}, retrieved {new Date(c.retrievedAt).toISOString().slice(0, 10)}</span></li>)}</ol> : <p className="muted">No verified sources loaded.</p>}</section>
    {run.notes.length > 0 && <details className="panel"><summary>Technical research notes</summary><ul>{run.notes.map((x, i) => <li key={`${x}-${i}`}>{x}</li>)}</ul></details>}
    </details>
    <StockNextAction run={run} />
  </>;
}
