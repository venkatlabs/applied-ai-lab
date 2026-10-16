# Five-case research outlook — October 8, 2026

## What the owner liked
Reviewed the five recent Investing chats: Analyze IONS stock, Analyze XENE Stock, Analyze FRMI Stock, FRVO Stock Analysis, and Corteva Stock Analysis. Common pattern: a clear rating/action first; business bull and bear drivers; a dated one-year scenario distribution; upside alongside loss risk; timing and conditions that change the view; separate portfolio fit and analyst consensus.

The chats are design references, not verified market evidence. Their prices, clinical events, financing claims, analyst calls and ratings were not imported into the live tool. No private portfolio amounts are included here.

## Critical findings
- IONS's first summary conflicted with its own arithmetic. The representative cases imply $48.20 and approximately 11.3%, not $51.20/18.2%.
- XENE's representative-price arithmetic implies $45.00; exact scenario probabilities remain subjective.
- Range-based FRMI and FRVO cases cannot establish exact threshold probabilities without within-band assumptions. Even a positive weighted return may coexist with more weight on loss.
- Corteva's three representative points and its separate directional growth-probability claim use different interpretations. The portal must use one explicit convention.
- A 7/10 qualitative rating, analyst Buy consensus and a modeled probability of profit are different quantities. The existing unified rating stays the one investment score.

## Delivered behavior
- Five cases near the report's top: severe bear, bear, base, bull and severe bull.
- Each shows assumed weight, representative price, code-calculated return and operating drivers. Input formula, starting evidence, source links/dates and proposed assumptions are expandable.
- Code computes weighted price/return, modeled weights of gain/loss/unchanged, loss of at least 20%, and gain of at least 50%. These are discrete representative outcomes, not price bands or calibrated probabilities.
- New research requests the scenario model within the existing synthesis call. No extra provider or search call is added. Synthesis is bounded to 9,000 output tokens (including reasoning); the larger structured response can still cost more tokens than a shorter report. Daily cap and one bounded evidence follow-up remain.
- Supported earnings-equity or enterprise-sales models calculate prices from per-future-diluted-share metric, multiple and (enterprise basis only) net cash. Missing, malformed, unordered, undated/unlinked or improperly weighted models are withheld. Provenance checks do not establish factual truth.
- Binary-event biotech, pre-revenue and financial firms can still need a specialized model. This release does not manufacture one for them. The report names gaps.
- Every report offers a local hypothetical five-case explorer. User prices and weights consume no AI credits and cannot alter the archived report, valuation signal or unified investment rating. No automatic persistence.
- Buy/Hold/Wait and existing-holder guidance remain evidence-based. Assumed upside does not create a Buy. Intrinsic DCF remains a distinct long-term sensitivity view.
- Engine/skill v0.14.0; old snapshots are immutable. Old reports receive a useful empty state and explorer, not retrospective fabricated forecasts.

## Verification
Baseline: 196 tests, TypeScript clean. Final tests and release state are in HANDOFF.md. Added arithmetic regression from the IONS correction, weight/case/provenance/date/equity-bridge guards, provider contract and report rendering checks. Browser exercised actual component with synthetic inputs: five-case table and return summary render, a 99% weight sum suppresses output, changing a bull-tail price recalculates the weighted result, returning to report assumptions restores it. No captured browser errors. Temporary fixture removed before final build. No paid live research or brokerage calls; fresh provider output remains to be evaluated.
