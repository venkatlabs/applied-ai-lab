# Equity Research Lab — Contextual Investment Decision Experience (Product Spec)
**Proposed enhancement · 2026-10-16 · status: specification, not implementation**

## Purpose
Use the October 16 NBIS research presentation as UX inspiration: make every stock assessment a concise, evidence-grounded decision page that explains **what changed in the company, sector and wider world**, shows a clear qualitative investment rating, and lets the reader understand five possible 12-month outcomes and why their probabilities differ. Adapt the visual design, not any NBIS market facts or historical assistant forecast as ground truth.

## Relationship to existing product
Build on the existing v0.14 five-case research implementation (see `HANDOFF.md` and `docs/FIVE_CASE_RESEARCH_2026-10-08.md`), unified six-factor decision, deterministic valuation, on-demand web review, immutable snapshots, provider adapters, portfolio-first navigation, and local scenario explorer. This is a refinement, not a second scoring engine. Preserve existing Portfolio/Activity navigation, owner-only protection, daily budgets, point-in-time archives, and no-order-submission scope. Portfolio values stay hidden by default unless user reveals them.

## Required page layout (desktop and mobile)
1. **Decision header**: ticker/company, exchange, quote + exact quote as-of/timezone and delay, percent change and period, rating (Buy / Hold / Avoid / Not rated), **score out of 100**, confidence in underlying evidence (separate), one-sentence thesis. Show the difference between "business quality confidence", "near-term price conviction" and "buy-more confidence"; none means calibrated probability of profit.
2. **What changed / Current affairs**: ranked company-specific, sector, industry, macro, regulatory and competitor events; show event date, publication date, retrieval time, source, direction, mechanism affecting earnings/valuation, and degree of uncertainty. Differentiate direct company evidence from sector spillover and model interpretation. A market move must not automatically be attributed to a headline. Highlight information published since the prior saved report.
3. **Business-performance panel**: revenue trend, margins, profit and free cash flow, capex, debt/liquidity, backlog quality, dilution, guidance, competitive position, valuation. Sector-aware handling: infrastructure capex and contracted backlog; biotech binary trials and runway; financials banking ratios; pre-revenue industries. Show missing/unavailable instead of guessed ratios.
4. **Bull versus bear**: paired narratives with dated citations, critical assumptions, disconfirming facts, and thesis killers. Prioritize the strongest evidence on each side, not equal-length filler.
5. **Analyst intelligence**: distribution of *dated* analyst target prices and revisions; low/median/mean/high, sample count, exclusions for stale/pre-corporate-action targets, historical analyst reliability by sector only when demonstrably backtested. Analyst target consensus must never be equated with model expected return or a probability.
6. **Five-case 12-month distribution**: severe bear/bear/base/bull/strong bull, mutually exclusive, 100% total weight, representative price, price range only when supported, percent return, narrative catalyst, assumptions and evidence links. Show bar/histogram, reference-price marker, deterministic probability-weighted expected price and return, probabilities of gain/loss/threshold breaches. Explicitly mark subjective vs historically calibrated vs options-implied probabilities; *never* imply subjective percentages are measured confidence. Account for overlapping ranges and threshold interpolation limitations. Preserve intrinsic DCF values as separate from terminal market prices.
7. **Interactive explorer**: sliders for scenario probabilities, market multiple, earnings/sales/capex/dilution, forecast horizon; weights must sum to 100% or trigger validation; no silent renormalization; all price/return/math computed deterministically in code; maintain clear "hypothetical, unsaved" mode and restore-original control. No archived report mutation or unannounced backend billing.
8. **Personal holding decision (only if requested/revealed)**: current shares, cost basis, portfolio weight, correlations/overlap, what-if dollar P/L and staged buy/hold/trim comparisons. Do not infer holding market value from dollars invested; do not claim executed trades. Treat tax and risk notes as conditional; no automatic orders.
9. **Catalyst watch / scorecard footer**: next earnings, regulatory/clinical events, financing and milestones, event date confidence, exact bullish/bearish observation needed, score breakdown with weight and linked evidence, missing data, next review conditions; concise recap of why rating could change.

## Scoring contract
- Keep the current **one six-factor deterministic directional score** and transparent 0–100 weighted rollup. Expose factor score, weight, evidence confidence, source recency, and explanation.
- Distinguish 1) factor/overall research score, 2) evidence confidence, 3) qualitative action conviction, and 4) probability of positive return. Do not collapse them into one number.
- Unknown valuation or insufficient essential evidence retains the current not-rated/decision-withholding gates. No forced Buy label or LLM-overridden deterministic arithmetic.
- Version scoring methodology and preserve snapshot historical integrity.

## Backend and provider integration ("NCD" clarification)
The request mentions **NCD servers**. This spec provisionally treats that as **MCP or analogous external data/agent connector servers**; the exact NCD product/protocol is not established and must be confirmed before implementation. Use a server-side adapter registry, not client-side API keys:
- Market prices/history: licensed quote vendor(s), exchange timestamps, split-adjustment, stale status.
- Fundamentals, filings and earnings: SEC filings/company IR, current existing SEC/FMP adapters; standardized financial statement and guidance fields.
- Analyst ratings/revisions: FMP/TipRanks or approved provider with explicit observation timestamps.
- News/current affairs: cited news and primary press releases, deduplication, event extraction and sector classification.
- Macro/sector: benchmark/peer performance, rates, input-cost and regulation feeds, with direct vs inferred causality labels.
- Optional portfolio: authorized read-only SnapTrade/Robinhood/Fidelity connector, user-scoped; explicit sync coverage/as-of; never leak private holdings in a public report or send to unrelated LLM prompts.
- Optional options implied moves: only with licensed chain, timestamp, expiry and calculation method; never substitute fabricated volatility for unavailable data.

Connector interface: `discoverCapabilities()`, `fetch(subject,asOf)`, `normalize()`, `getProvenance()`, `health()`; authenticate server-side; typed schema with `value,currency,unit,sourceUrl,eventAt,publishedAt,retrievedAt,asOf,provider,quality,stale`. Provide circuit breakers, retry limits, per-provider quotas, fallbacks and cached results. A failed provider must create an explicit data gap, not an apparently complete report.

## Evidence and model governance
- Source hierarchy: regulatory and company disclosures > market infrastructure > licensed professionals > credible journalism > social commentary. Sources must be attributed to individual facts, not blanket "Sources" sections.
- Store and distinguish event, publication, data-as-of and retrieval timestamps; prevent look-ahead contamination in backtests and archives. Flag corporate actions, restatements and estimates versus actuals.
- AI can summarize, critique and propose bounded assumptions; formulas, weighting, probability sums, target return calculations and valuation run in tested deterministic code.
- No automatically asserted true probabilities; default subjective scenario weights. Calibration is a separate research workstream requiring archived forecasts, realized outcomes and scoring (Brier/log/coverage), plus sampled sector-specific evaluation.
- Stale or contradictory evidence should downgrade evidence confidence, not silently generate precision.
- All reports immutable; updated research creates a new dated snapshot with a diff.

## UX acceptance criteria
- At 320px mobile width, the quote/date, rating/confidence and core bear/base/bull shape remain readable without horizontal scrolling.
- Any numeric indicator has accessible units, as-of date and an explanation/tooltip. Distribution and scorecard have text/table alternatives; don't rely on color.
- Scenario probability sum validation blocks mathematically invalid expected values. All user edits are local and reversible.
- Source panel links primary documents next to claims; no citationless causal assertion about a selloff.
- Analyst consensus and forecast expected price are labeled separately. Score 7/10 never masquerades as 70% price appreciation odds.
- Missing data and failed connectors lead to honest "insufficient evidence" states.
- Research retains current paid-call caps, caching, archive integrity and owner authentication. No trading permissions or brokerage credentials in frontend.
- Automated test fixtures cover volatile AI infrastructure (NBIS), mature profitable company, biotech binary event, corporate spin-off, pre-revenue company, missing analyst coverage and stale quotes.

## Suggested delivery sequence (no implementation authorized by this spec alone)
**P0:** Clarify NCD protocol; implement structured current-affairs evidence cards and citation/timestamp checks, plus responsive decision header and score breakdown.  
**P1:** Visual five-case probability chart, reversible scenario control and reliable threshold probabilities; regression tests for arithmetic.  
**P2:** Analyst target distributions/revisions, source freshness and provider diagnostics, sector-adapted financial panels.  
**P3:** Portfolio-aware what-if only on explicit reveal, catalyst diffs, optional calibrated probability research after outcome data exists.

## Existing open work not superseded
Security/owner-key PR, first broker-account refresh/reconciliation, live source-level validation of fresh v0.14 reports, import classification and historical return quality, and cost control. These remain separately tracked in the current handoff and Notion.
