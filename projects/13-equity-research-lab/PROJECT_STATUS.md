## October 8, 2026 — five-case research outlook
Adapted the five recent stock-analysis chats into a decision-first one-year scenario view: five representative outcomes, explicit assumptions/sources, deterministic weighted returns and loss/gain weights, plus a free local explorer. Unified rating and valuation guardrails remain. No extra provider call. Unsupported sector models remain explicit. See `docs/FIVE_CASE_RESEARCH_2026-10-08.md` and HANDOFF for release checks.

# Project Status

## Current milestone — 2026-10-07

Browser feedback implemented: connected-account selection with read-only holdings and separate refresh/provider dates; manual imports below the primary flow; Saved research first and optional journal last; bounded automatic evidence follow-up with explicit remaining gaps. Foreign-filer USD balance-sheet extraction corrected. 196 tests, TypeScript and build pass. Technical scope and limitations: `docs/BROWSER_FEEDBACK_2026-10-07.md`; release/live state: `HANDOFF.md`.

## Current milestone — 2026-10-06

Portfolio home is the approved direction. Portfolio and Activity replace eight peer menu links; Account settings supplies the data. Connected/saved holdings, concentration, existing-holding review and comparison start at home. Activity consolidates decisions, saved research and research outcomes. Existing calculations and cost controls are preserved. 180 tests, TypeScript and build pass; synthetic production browser flows and 320px home layout verified. Release state: `HANDOFF.md`. Scope/limits: `docs/PORTFOLIO_HOME_2026-10-06.md`.

# Current working milestone — 2026-10-04

Engine v0.13.0 adds dated investment-case checks in new full reports and review status beside holdings. Missing evidence is visible and does not change verdicts. The research skill now includes independently authored thesis-review guidance, without unvalidated numerical gates. 180 tests, TypeScript and production build pass; local synthetic report and holdings browser checks pass. Fresh paid-provider output remains unverified. See `docs/THESIS_REVIEW_2026-10-04.md` and `HANDOFF.md` for release state.

# Previous milestone — 2026-10-02

The account refresh now feeds My holdings, report-level holding context, Portfolio Lab and a symbol-selectable holding diversification comparison through tab memory and in-app navigation. The generalized comparison covers keep, immediate 25%/50%/75%/100% trims, and a staged 50% trim. Connected Portfolio Lab runs locally and does not submit connected amounts to the cloud save route. It starts with the current mix and an editable equal-weight comparison; return/risk placeholders are zero until the user edits or loads historical risk. Incomplete/unpriced/overlap exposure is flagged.

PR #7 merged as `4758c63`; both production deployment checks passed. 163 tests, TypeScript and production build pass. First live SnapTrade refresh remains unverified.

## v0.12.0 — combined review delivery

Claude’s broker CSV import, single scoring model and exploratory backtest are recovered on the review branch. Codex adds valuation/data-quality guards, correct margin-of-safety arithmetic, full-report priority over quick checks, and atomic pre-call usage reservations. 146 tests, type checks and build pass. See `HANDOFF.md` and `docs/REVIEW_2026-09-30_codex.md` for delivery status and limits. Older sections below are historical.

## v0.7.0 — readable decisions, web evidence and archive cleanup

Plain-English executive summary and deterministic investment-confidence heuristic;
conditional share/options comparison and manual quote payoff calculator; on-demand
cited web reviews with persistent usage limits; reversible private archive Trash.
42 tests passed. Production checks verified archive removal, hidden reads, identical
restoration and cross-site mutation rejection. A new NVDA executive summary and an
NBIS web review both completed and saved successfully. Robinhood quote access remains
unconnected: no actual contract recommendation or order execution is claimed.

## v0.6.0 — private durable research and end-of-day fallback

Supabase stores immutable server-generated reports in private browser workspaces.
Alpha Vantage supplies end-of-day quotes when FMP fails, with a six-hour persistent
cache and atomic 24-call daily cap. Archive reads do not rerun research. Legacy
browser copies remain available. Database failures fall back visibly to browser storage.

Production migration applied and RLS/public-access restrictions verified on 2026-09-25.
Live NVDA, AMZN, GOOGL, MSFT and NBIS reports saved successfully. NBIS now has a
verified Alpha Vantage price and SEC-backed partial analysis; missing forecasts still
withhold scenarios and cap confidence. Saved report equality and cross-workspace
404s verified for all four FMP sample reports; browser archive reopening verified for NBIS.
30 automated tests and production build/type checks passed.

## Prior v0.5.2 research controls

Deterministic evidence confidence and scenario arithmetic, categorical evidence-adjusted ratings with per-dimension explanations, matched SEC periods, forecast horizon guards, and saved browser snapshot review are implemented.

Validation: 21 regression tests pass; production build and type checks pass. Live NVDA, AMZN, GOOGL and MSFT reports exercised; CROX, DECK and IBM fail safely under current FMP subscription restrictions. See [live review](evals/LIVE_REVIEW_2026-09-25.md) for recorded results and limits.

## Remaining capabilities

- Independent intrinsic valuation and deeper primary-source qualitative analysis.
- Broader forecast coverage and deeper financial context for less-covered symbols.
- Account sign-in/cross-device recovery and scheduled historical-price evaluation.
- Analyst-level track records and supported options-chain analytics.
- Separate dependency maintenance for reported framework/test-tool advisories.

The portal is suitable for reviewing the research workflow and its disclosed sensitivity assumptions; it is not a trading system. No trades are executed.

NBIS follow-up: accept US-GAAP USD annual 20-F/40-F facts and amendments; show verified annual metrics when market quotes are unavailable. FMP errors preserve sanitized provider detail instead of treating every 402 as proof of endpoint exclusion. Quote/forecast entitlements still depend on the configured provider account.
