# Report quality checks and historical range — 2026-10-22

From Venkat's "AI learnings from Instagram saves" (Muse digest). Only two ideas fit this tool; both are built, free to run, and add no AI calls.

## 1. Production-grade checks (carousel #16)
- `lib/report-quality.ts` + "How well is this report sourced?" on every report: share of claims tied to a source retrieved for that report, evidence-date versus source-date consistency (a source published more than 7 days after the evidence it supports is flagged; future evidence dates and invalid dates are flagged), cost, time and engine version. `ReportCost.durationMs` now records generation time.
- `evals/manifest.json` + `evals/fixtures/*.json` + `tests/eval-fixtures.test.ts`: seven synthetic full-report cases (complete compounder, improving cyclical, headlines versus weak fundamentals, missing evidence with a stale price, distress, stale report, date inconsistency) with the expected verdict, confidence, score range, hurdle result, sourcing and date issues. Also asserts no look-ahead, that headlines never change a verdict, five-case completeness and hurdle-price consistency. Add a case whenever a real report is wrong or confusing.

## 2. Historical range instead of only assumed weights (trading-skills reel, "Time Machine")
- `lib/price-simulation.ts`, `/api/simulation`, `components/HistoricalRange.tsx`: bootstrap of the stock's own monthly adjusted returns over 12 months (10,000 seeded paths). Two versions: as it happened (keeps past drift, optimistic for past winners) and swings only (drift removed). Shows median, 10th and 90th percentile prices and the chance of ≥15% gain, any gain and ≥20% loss, and compares the swings-only median with the report's own five-case weighted return.
- Needs at least 60 usable monthly returns; otherwise says so. Uses the existing cached Alpha Vantage monthly history (24 h cache, shared daily allowance). Not a forecast; it ignores the business, valuation and regime changes.

## Not adopted, and why
- **The day-trader skill pack itself.** It is built for intraday US stock setups; this tool is a 12-month, evidence-first researcher. Third-party skills run with an agent's access, and we have not reviewed this repository, so it is not installed. The one transferable idea (simulate the outcome distribution) is re-implemented here in our own tested code.
- **Anthropic knowledge-work plugins.** The finance plugin is accounting (journal entries, reconciliation, close) and the data plugin is SQL and dashboards. Neither does stock research. The repo's skill layout matches `skills/equity-research` already.
- Mission-control dashboards, receptionist, shorts and clone suites: not relevant to this repo. A Cowork dashboard over the Notion inbox is a separate project.
