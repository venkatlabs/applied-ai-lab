# HANDOFF — Equity Research Lab

> The baton. Read this first and update it last. Protocol: `AGENTS.md`.
> Notion mirror: 🧠 Venkat AI Hub → Project — Equity Research Lab → Handoff log.

**Current holder:** none. Claude PRs #30–#33 and Codex PRs #34–#35 merged; the outcome-consistency PR is the newest.
**Last updated:** 2026-10-21 by Claude. Resumed; baseline 286 tests green. Made the holdings advice and stock action summary use the same research outcome as My stocks (verdict + confidence), so a stock with incomplete evidence no longer reads "Research first" while My stocks shows a verdict. Reports up to 90 days old still inform verdicts; new-position buy candidates still need a report 30 days old or newer. Owner setup still pending (see Next up). Unverified live: Google sign-in, migrations 006/007/008, cron runs, prompt v0.15.1 on a real report.
**Prior update:** 2026-10-20 by Claude (UX rebuild, hurdle price, Watch).
**Main baseline:** `fb024f2` (PR #34 decision-action layer).
**Latest feature work:** PR #34 / merge `fb024f2` (decision-action layer); PR #33 / merge `d1cd677` (Watch).
**Validation:** final PR #34 head `f5ae4ef` passed TypeScript, automated tests and production build; both Vercel PR preview checks passed. Post-merge Vercel deployments for both the Equity Research Lab and repo root passed on merge `fb024f2`. No paid research, live brokerage refresh or trades were performed for this change.
**Notion plan:** https://app.notion.com/p/3eddf6e02bd78120a3fcf8f8cc768af1

## State

**October 20 decision-action layer:** The portal now has one deterministic action vocabulary downstream of the existing research score: buy/add candidate, hold, hold/do-not-add, trim candidate, sell/exit review, research first, wait/watch and fund-exposure review. A ranked queue is shown on Portfolio and after a connected-account refresh; each stock report ends with a portfolio-aware final next step. Connected average cost is retained only when every combined share has valid reported basis, and tax-loss language is blocked from pretending average cost is actual lot data. See `docs/DECISION_ACTION_LAYER_2026-10-20.md`. P0 next: actual tax lots/wash-sale graph + account tax location, fund look-through/overlap, and one persisted owner portfolio-policy profile. Trading remains out of scope until recommendation quality is prospectively validated.

**October 8 five-case outlook:** Reviewed five recent Investing stock chats as design references, not verified company facts. Reports put the existing unified decision first, then severe bear through severe bull representative outcomes, explicit hypothetical earnings/sales assumptions, source links/dates, weights, deterministic weighted returns and gain/loss weights. A free local explorer changes hypothetical inputs without changing the saved report or rating. Model generation uses the existing synthesis with a 9,000-output-token cap; no additional provider call. Unsupported sector models show exact gaps. Intrinsic values remain separate from one-year prices. Engine/skill v0.14.0. See `docs/FIVE_CASE_RESEARCH_2026-10-08.md`. Existing fresh-source evaluation task in Notion now includes the model assumptions. Binary-event and pre-revenue sector models, probability calibration and live source validation remain open.

**October 7 browser feedback:** Connected account dropdown selects all or one account and scopes Portfolio home/holdings/comparison through tab memory. Values are read-only; app refresh time and provider holdings/sync dates are distinct. Manual imports are collapsed below guidance. Activity starts with Saved research; journal is optional and last. Full research makes at most one automatic targeted evidence follow-up, consuming a second daily slot and at most three searches. Archived incomplete reports offer Complete research. Remaining gaps are explicit; no forced Buy. Foreign SEC USD instant cash/debt facts now accept 20-F/40-F/6-K. IFRS tags and normalized loss-making valuations remain gaps. See `docs/BROWSER_FEEDBACK_2026-10-07.md`.

**Portfolio display privacy:** User requested numbers hidden by default and revealed on demand for ten minutes. Shared memory-only reveal across in-app navigation; fixed deadline, manual Hide and reload reset. Native hidden/inert removes private details from display and accessibility; forms/results stay mounted to preserve drafts. Public research metrics stay visible. This is display privacy, not account access control or encryption. PR #13 merged/deployed and live verified; see `docs/PORTFOLIO_PRIVACY_2026-10-06.md`. Durable decision and handoff mirrored in Notion. No new owner action.

**Portfolio home navigation:** Venkat selected Portfolio home from three reviewed mocks. Main navigation now has Portfolio and Activity plus Account settings. The home reads connected or saved holdings, shows mix/coverage/date/concentration and per-position review/comparison actions. `/compare` autoloads the selected holding and offers the existing six trim strategies with a collapsed custom mix. Activity consolidates journal/archive/research outcomes. 180 tests, TypeScript and build pass. Local production browser verified synthetic MSFT/VTI weights, one-click non-AMZN comparison, Activity views and 320px layout. No paid research or live broker call. PR #12 merged as `33171c8`; CI, previews and both production deployments pass. Live home, saved-snapshot comparison autoload and Activity journal/cloud archive verified; see `docs/PORTFOLIO_HOME_2026-10-06.md`. Claude security PR #11 is open and remains separate.

**Dated investment-case review milestone:** user authorized autonomous iteration while AFK. Engine v0.13.0 and the existing equity research skill adapt falsifiable conditions and business-specific questions from the reviewed package. New full reports include up to three dated/source-linked observations, proposed change conditions, reported or suggested review dates and evidence gaps. My holdings shows review status and saved-report links through Next Link. Deterministic guards withhold unsupported observations; review dates do not alter verdicts. 180 tests, TypeScript and production build pass. Local synthetic saved-report and holdings browser checks pass, without paid research or brokerage access. Fresh live report output remains unverified. No migration. Details and next priorities: `docs/THESIS_REVIEW_2026-10-04.md`.

**Personal dashboard milestone 1:** user approved all six milestones and cost controls. PR #6 merged as `efb4d89`; the `/accounts` page is deployed and loaded behind Vercel authentication. It offers manual read-only Fidelity and Robinhood refresh, account type, brokerage-reported total, explicit cash, positions and provider timestamps. Other institutions are skipped before per-account requests. Data remains in page memory, is not archived, and no AI calls or trades are made. The endpoint is POST-only and same-origin. Venkat reports that server-only SnapTrade variables are configured; first live refresh and statement reconciliation are still pending. Keep Vercel Deployment Protection → All Deployments enabled. The existing workspace cookie remains anonymous. No secrets or brokerage records are stored. Read `docs/PERSONAL_CONNECTION_PILOT.md` before proceeding. Monarch has an official MCP, currently under maintenance; none is connected here.

**Personal dashboard interlink milestone:** commit `036bd5b` adds one tab-memory snapshot shared through in-app navigation. Connected positions feed My holdings, report-level position context, Portfolio Lab and the generalized holding-diversification page. My holdings keeps data in memory by default; the owner must click Save to persist a browser copy. Connected Portfolio Lab runs locally and does not send account-derived amounts to the portfolio save API. The generic diversification page accepts any held stock or fund and compares keeping, 25%/50%/75%/100% immediate trims and a staged 50% trim. Its assumptions are editable and explicitly illustrative. Portfolio Lab starts with the current mix versus an equal-weight non-cash mix; zero return/risk placeholders must be replaced or supplemented before interpreting a run. Direct-stock, sector, AMZN and unknown-fund flags remain account-scoped. Missing/unsupported positions and possible account overlap mark the portfolio partial. Reloading clears the connected snapshot. Validation: 163 tests, TypeScript and production build pass.

**Fidelity import repair:** the reported upload failure was an income CSV selected in the positions importer. The provided positions CSV parses. New import review sits at the top, names the selected file/errors, requires choosing one account from multi-account exports, shows AMZN/cash/basis/date summaries and links to the AMZN workflow. Unlisted row values remain in account totals; linked-account overlap is flagged. Total basis takes precedence over rounded average basis. Download timestamp is shown separately from the snapshot date. Local browser upload/save/AMZN transfer verified with the provided file; no raw file, account identifiers or personal figures are committed. Two synthetic regression tests added.

**Current delivery (Codex):** recovered Claude's missing four commits from `equity-part2-import-scoring-backtest.mbox`, preserving authorship. Branch includes broker CSV import, one scoring model and the exploratory backtest. Engine v0.12.0 fixes the 15% margin, stale/unsupported quick-check signals, full-report priority, partial CSV coverage and cash-flow convention. Direct-stock concentration now excludes cash from the effective-count calculation and flags incomplete fund exposure. Provider calls now reserve attempts atomically before work; failures count. No database migration required. Review: `docs/REVIEW_2026-09-30_codex.md`. Older dated entries below describe prior states.


v0.9 engine is deployed at https://13-equity-research-lab.vercel.app (live mode, FMP + SEC + Alpha Vantage + OpenAI, Supabase archive).
It has research reports, a 6-factor investment decision, peer valuation for 13 hard-coded sectors, cited web briefs,
a holdings workspace, Portfolio Lab (Monte Carlo) and an AMZN decision workspace.
Codex paused on 2026-09-25 because of credit limits. Claude reviewed the project on 2026-09-30: `docs/REVIEW_2026-09-30_claude.md`.


**Session 3b (same branch):** broker CSV import (Fidelity/Schwab/Vanguard/generic, `lib/broker-import.ts`); one scoring model (AI no longer asked for the unused 12-dimension scorecard → fewer tokens per report; `run.score` = six-factor score; SKILL.md rewritten, engine v0.11.0); point-in-time backtest of DCF zones at `/backtest` (`lib/backtest.ts`, SEC facts filed-by-date + actual price, 12m excess vs SPY).

**2026-09-30 Claude session 3 (branch `claude/quick-check-watchlist`, not merged).** Steering from Venkat: personal portfolio decisions first; a generic tool is the future vision (see `docs/PRODUCT_STRATEGY.md`).
- **Quick check** (`lib/quick-check.ts`, `/api/quick-check`): AI-free DCF snapshot, zone (Buy zone ≥15% margin / Fair / Expensive / Not valued), buy-below price. Metered by `QUICK_CHECK_DAILY_CAP` (default 60) in `equity_provider_usage` (no migration), cached per ticker per day.
- **Watchlist** (`/watchlist`): browser-private list, check all, ranked table, diversification ideas for sectors not held.
- **Position decisions** (`lib/position-advice.ts`) on /holdings: ordered rules (concentration > recent full report > quick-check zone) → Trim to limit / Review selling / Trim candidate / Hold / Hold, don't add / Add candidate; optional average cost → tax note. Reprice holdings from today's checks. **Decision journal** graded against later prices.
- **Find stocks** is quick-screen first (10 or ~45 names), full reports for finalists. Report shows buy-below + DCF sensitivity grid. Home page is portfolio-first. Report holding panel limit 20%→10%.

**2026-09-30 Claude session 2 (merged as PR #2):**
- **Vercel:** Deployment Protection switched from *Standard* (which left the production URL public) to **All Deployments**. The live app now requires a Vercel login on the team. Done in the dashboard, no code.
- **P0 code guard:** `/company/[ticker]` no longer runs research on GET (shows today's saved report or a Run button). `/api/analyze` is POST-only + same-origin. Global daily cap on new live reports (`RESEARCH_DAILY_CAP`, default 15, counted from saved snapshots, fails closed without DB). Same-day same-ticker reuse. Opportunities screen uses POST and stops at the cap. `robots.txt` + `X-Robots-Tag: noindex`.
- **Valuation:** `lib/intrinsic-valuation.ts` deterministic DCF (FCF, or net income when capex > 60% of OCF; consensus revenue CAGR clamped −5..25% fading to 2.5%; 10/9/8% discount; + net cash from SEC). Excludes banks/insurers; caps cyclicals and no-forecast cases. `lib/valuation-factor.ts` sets the valuation factor in code (more conservative of DCF vs complete peer table). Scenarios are now intrinsic bear/base/bull, not price-anchored. Engine v0.10.0.
- **Diversification:** holdings page gets a concentration check (single-stock/sector limits, trim-to-limit $, effective # of stocks, top-5).
- **Learn loop (v1):** `/performance` grades frozen reports against later saved reports of the same ticker (30/90/180/365d). Zero API cost.
- **CI:** `.github/workflows/equity-research-lab.yml` (tsc, test, build).

## Next up (in order)

00. **Venkat (owner setup, none of it done yet):** Google OAuth client + `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `OWNER_EMAILS` (docs/GOOGLE_SIGNIN_SETUP.md); run Supabase migrations 006, 007, 008; set `CRON_SECRET` (docs/WATCH_2026-10-20.md); then refresh accounts and press Research on unresearched holdings. `OWNER_ACCESS_KEY` is only a fallback while Google sign-in is unset. Notion Inbox has one card per step.
- Owner: complete the existing owner-key / security PR #11 setup and first brokerage refresh/reconciliation task. Portfolio home is delivered; no new navigation approval is needed. Next agent: verify imported mutual-fund classification, then improve portfolio-aware candidate additions and destination allocations without adding more menu destinations.

0. Any agent: evaluate one fresh v0.14.0 report against actual source observations, dates, proposed thresholds, event dates and five-case operating/dilution/valuation assumptions. Prefer an existing report; otherwise one explicit capped request. Notion action: https://app.notion.com/p/3efdf6e02bd781399bd9d6c13b0df83e. Skill validation script lacked PyYAML; frontmatter/reference paths inspected manually.
1. Venkat: refresh `/accounts` and confirm holdings remain available while navigating to My holdings, Portfolio Lab and Diversify a holding. Reconcile account coverage, totals and dates against the brokers; record status only, never raw values. Reloading should clear the in-memory snapshot.
2. Build the next approved decision milestone on the shared portfolio: compare destination allocations and staged reductions with clearer cost-basis and uncertainty handling. Keep alternatives user-editable and avoid forced Buy labels.
3. Verify imported mutual-fund classification before fund look-through, then continue Monarch where its official MCP is available, historical ROI (XIRR/TWR only with sufficient dates/flows), and prospective benchmark validation. No automatic sync/research or trades.

## Open questions for Venkat

- Venkat reports that separate SnapTrade Personal credentials are configured in Vercel. The existing ChatGPT SnapTrade connection does not supply credentials to this website. Do not share any key through chat or Notion. First live refresh remains unverified.

- ~~Auth~~ Decided: Vercel Deployment Protection, All Deployments, plus (2026-10-04, pending merge) owner sign-in on `/accounts` and `/api/snaptrade`, because the Origin check alone is forgeable outside a browser. ~~Daily cap~~ Set to 5 by Venkat (2026-09-30).
- Are the 10% single-stock / 30% sector defaults right for you? (Editable per session on /holdings.)
- Is a 15% margin of safety the right "buy zone" threshold?
- Generic-tool direction: see `docs/PRODUCT_STRATEGY.md`. The narrow candidate is an educational concentration planner for stock-comp employees.
- FMP plan upgrade vs an SEC-only tier for mid-caps?

## Log

- 2026-10-24 Claude: first real Prepare-now run produced five reports in 0-4 s with no rating (AI steps failed fast; cause pending the report's provider note). Morning job now marks unrated runs as failed with the reason, stops the new-stock search when research is failing, a newer unrated run no longer hides an older rated report on My stocks, NBIS has a sector. Cron itself verified reaching the app (Saturday skip).

- 2026-10-24 Claude: morning job split into plan / research-one / finalize; added the signed-in **Prepare my brief now** button (`/api/morning`) after Venkat's cron Run showed no log. Cron-not-firing diagnosis steps in docs/MORNING_PREP_2026-10-23.md.

- 2026-10-23 Claude: morning preparation job (Vercel Cron 12:00 UTC): fresh reports on the 3 most concentrated stocks plus 2 new names across industries, a percent-only brief with deconcentration math at the top of My stocks, verdict-change alerts. Migration 009. Off until MORNING_RESEARCH_ENABLED=true. Digest cron folded into the Sunday morning run (two crons total). docs/MORNING_PREP_2026-10-23.md.

- 2026-10-22 Claude: from the Instagram-learnings digest, added report quality checks (source coverage, date consistency, cost/time) and seven fixed evaluation fixtures run in CI, plus a free historical range simulation per report. docs/REPORT_QUALITY_AND_RANGE_2026-10-22.md. Day-trader skill pack deliberately not installed.

- 2026-10-21 Claude: resumed. Unified holdings advice and stock action labels on `researchOutcome` (lib/outcome.ts); outcome now tolerates archived reports missing optional text fields. 292 tests.

- 2026-10-20 Claude: Watch features (triggers with status and goalpost log, calendar, daily no-LLM monitor via Vercel Cron, weekly digest, capped refresh of stocks whose dated test passed). Migration 008. Needs CRON_SECRET.

- 2026-10-16 Claude: UX rebuild. Google OIDC sign-in with email allowlist (env: GOOGLE_CLIENT_ID/SECRET, AUTH_SECRET, OWNER_EMAILS; unset = old behavior), archive owned by account + legacy workspace claim (migration 006), followed stocks on the account (migration 007), research outcome (verdict + confidence, never 'no answer'), My stocks home with batch research of unresearched holdings (confirm + budget cap), per-stock history, automatic research calls journal. Owner-key flow kept only as fallback when Google sign-in is not configured.

- 2026-10-16 Claude: built P0 (current-affairs evidence cards with citation/date validation, score breakdown, responsive decision header), engine v0.15.0, no extra paid call. PR #28 merged as `1290bd1`. Holder released.

### 2026-10-08 — Codex: five-case research view (PR #15)
- Adapted IONS, XENE, FRMI, FRVO and Corteva chat structure: clear rating/decision, scenario distribution, operating drivers, downside, timing and change conditions. Chat market facts were not imported; arithmetic inconsistencies informed deterministic regression tests.
- Five-case sourced starting facts plus explicit forecast assumptions, code-computed prices/returns/weighted outcomes, provenance/date/weight guards. Free local scenario explorer does not change archived ratings. Existing DCF remains separate; unsupported models remain gaps.
- Code `0dbe5d3`, merge `94360fc`; 206 tests, TypeScript, build, CI and both preview/production checks pass. Synthetic component browser tests and live saved report/explorer/calculation/restoration pass, no captured browser errors.
- No paid research, trades or brokerage calls. Notion Decision Log/project context and existing fresh-source evaluation task updated. Next agent evaluates one fresh v0.14.0 model against its sources, preferring an existing report. Owner reconciliation/security PR #11 remain open. Holder released.

### 2026-10-07 — Codex: five browser comments delivered (PR #14)
- Connected account selection replaces editable account scope for connected holdings, with read-only values and separate refresh/provider dates. Account selection is shared across portfolio tools; imports and journal are lower priority.
- One bounded automatic full-report evidence follow-up and explicit archive completion controls; existing daily cap applies to each new report. Foreign-filer balance facts fixed without inventing missing debt or valuation inputs.
- Code `69a1965`, merge `2e9a1b9`. 196 tests, TypeScript, build, CI and both preview/production checks pass. Synthetic actual-component and local production UI checks pass.
- Post-deploy in-app browser navigation repeatedly timed out. Next agent should verify the live holdings/Activity pages, then one fresh targeted report against source evidence. No paid research or live brokerage calls in this delivery. Existing owner reconciliation and security PR #11 remain open. No private figures in GitHub/Notion.

### 2026-10-06 — Codex: approved Portfolio home navigation
- Two main destinations, accounts as settings, compact portfolio overview and holding rows, one comparison entry point, Activity journal/archive/outcomes. Prior URLs remain usable.
- Selected connected/saved holdings autoload into trim comparisons; changing symbols loads values immediately. Latest saved report links avoid a needless fresh-research entry. No paid calls added.
- 180 tests, TypeScript and build pass. Local synthetic production browser verification and phone layout pass. Cloud archive unavailable locally; visible browser fallback verified. Live data, tax-lot/fund overlap and ROI limits remain open.
- Notion project direction, Decision Log and Handoff log updated. Code `d0beced`, PR #12 merge `33171c8`; CI, both previews and both production deployments pass. Live home/saved snapshot, selected-holding autoload, Activity journal/cloud archive and clean browser log verified. Holder released.

### 2026-10-04 — Claude: owner sign-in for connected accounts (branch `claude/owner-auth-snaptrade`)
- Security review finding: `/api/snaptrade` returned all Fidelity/Robinhood positions with cost basis, guarded only by a same-origin check (forgeable with curl) and Vercel Deployment Protection.
- Added `lib/server/owner-auth.ts`: `OWNER_ACCESS_KEY` (32+ chars, server-only) is exchanged at `/api/owner-session` for a 12-hour HMAC-signed, httpOnly, SameSite=strict cookie. Constant-time comparisons; unset or short key fails closed. `/api/snaptrade` returns 401 without a valid session; `/accounts` shows a sign-in form instead of the account UI. Sign-out via DELETE.
- Fixed the stale "no web route imports this module" comment in `snaptrade-personal.ts`. Added `vitest.config.ts` (`@/` alias) so route handlers are tested directly.
- Validation: tsc, 190 tests (10 new), production build pass. Local production-build check: forged-origin/no-session 401, wrong key 401, cross-site sign-in 403, owner sign-in 200, session reaches the enablement check (503 with portal disabled), sign-out returns to 401. No live SnapTrade call was made.
- Next: Venkat sets `OWNER_ACCESS_KEY` in Vercel and merges; then the existing "Verify linked portfolio refresh" item.

### 2026-10-04 — Codex: dated thesis reviews and release fix (PR #9 / #10, merged)
- User authorized autonomous iteration while AFK. Adapted the useful supplied-skill discipline into the existing research skill, without its numerical gates or hindsight-fit probability claims.
- New reports contain dated observations, exact source links, proposed change conditions, reported/suggested review dates and missing-information gaps. My holdings exposes review status and saved-report links through in-app navigation. Old reports remain immutable and show a useful legacy state.
- Deterministic source/date checks withhold unsupported observations; a review due date does not imply a failure or change a verdict. No valuation or score arithmetic changed. No migration or additional provider calls.
- Production review found an existing default-date hydration problem. PR #10 initializes the first render consistently and assigns today's date after mount while preserving saved/connected dates.
- 180 tests, TypeScript, production build, CI and preview checks pass. See validation header for production checks. Local synthetic UI and live column/legacy-report checks passed. Fresh paid-provider output and first live broker reconciliation remain unverified.
- Notion project context, Decision Log and AI Action Inbox updated; next agent task is source-level review of one fresh report. The existing Venkat brokerage verification card remains open. Keep private financial records out of GitHub and Notion.

### 2026-10-02 — Codex: project completion status rule (PR #8, merged)
- Added the required final report for GitHub code/docs and PR state, Notion context/action state, live deployment and end-to-end verification, and remaining owner/action. Deployment checks must be distinguished from user-flow verification.
- Updated the shared Notion Agent Handoff Contract and Equity Research Lab project page. The matching repository rule in `AGENTS.md` merged as [PR #8](https://github.com/geeveeyes/applied-ai-lab/pull/8), squash commit `eedfaee`.
- TypeScript, all 163 tests and production build pass. Documentation only; live portal unchanged. Latest production verification remains PR #7's passing Vercel checks; live brokerage refresh remains unverified.
- Next: Venkat verifies the account refresh through the linked workspaces and reconciles coverage/dates against statements.

### 2026-10-02 — Codex: connected portfolio interlink (PR #7, merged)
- One read-only refresh now feeds account review, My holdings, Portfolio Lab and a symbol-selectable holding trim comparison through tab memory and in-app navigation.
- Portfolio Lab keeps connected runs in the browser session; six strategies compare keep, 25%, 50%, 75%, 100% trims and a staged 50% trim. Missing/unsupported exposure remains visible as partial coverage.
- 163 tests, TypeScript and production build pass. [PR #7](https://github.com/geeveeyes/applied-ai-lab/pull/7) squash-merged as `4758c63`; both Vercel production checks passed. Live data/reconciliation remains unverified.
- Next: Venkat verifies one refresh through all linked pages and reconciles broker coverage/dates without recording financial figures. Then continue the approved allocation-comparison milestone.

### 2026-10-01 — Codex: portal merged and deployed
- PR #6 merged as `efb4d89`; Vercel production deployment uses that main commit. The live `/accounts` page loads while signed in through Vercel Authentication. Vercel Deployment Protection is enabled in the project settings.
- Venkat reports server-only SnapTrade variables are configured. The manual account refresh has not yet been clicked, so live holdings, coverage, provider dates and refresh repeatability are unverified.
- 156 tests, TypeScript, production build and GitHub Actions run 14 passed. No financial values or secrets recorded. Holder released to none.

### 2026-10-01 — Codex: connected accounts portal step
- Added `/accounts` with manual Fidelity/Robinhood reads, account coverage and freshness; excluded other institutions before reading positions/balances. Result is held only in page memory.
- Endpoint is same-origin POST-only and feature-disabled by default; no trades, AI calls, recurring sync, combined total or persistent raw financial data.
- 156 tests, TypeScript and production build pass. No real portal credentials; live refresh remains unverified. Next: owner adds server-only Personal API key after confirming Vercel All Deployments protection, then reconcile two refreshes.
- Code commit: `9444846`; pushed as head `479a3df`. GitHub Actions passed. Draft PR #6 updated; holder released to none.

### 2026-10-01 — Codex: personal connection pilot
- Approved milestones and cost policy saved in Notion; setup and implementation tasks created, decision updated.
- `df1aeea`: private read-only adapter and local check; 155 tests/types/build pass. SDK Axios override avoids introducing its pinned dependency advisory; existing baseline advisories remain.
- Live setup/reconciliation, owner access, storage and scheduling remain outstanding. No account modifications or trades.

- **2026-09-30 · Codex Fidelity upload repair.** Corrected confusing import feedback and multi-account handling; preserved unlisted value, exact basis and explicit date uncertainty. Baseline 146 tests; final suite 148 tests. PR #5 merged as `7163f22`; all checks passed. See Notion for production verification. Baton released.

- **2026-09-30 · Codex delivery complete.** PR #4 merged as `f9ed0fd`, code head `e191172`; 146 tests, type check, build and CI passed. Recovered all four Claude commits; corrected concentration, valuation, decision priority and usage reservation. Browser verification uses illustrative data only. Shared review and next priorities are in Notion; no owner push/merge action remains.

- **2026-09-30 · Codex shared review.** Reviewed `50439a1` and Notion; recovered four missing Claude commits (134 baseline tests). Corrected decision/valuation regressions and added atomic usage reservations. Final suite 146 tests; reviewed math against CFA/Damodaran cash-flow conventions. Branch `codex/shared-tool-review`; code at `855b8de`. No claims of proven investment returns. See Codex review for remaining gaps.

- **2026-09-30 · Claude (session 3b).** Broker CSV import, one scoring model, zone backtest. 134 tests. Branch not pushed (session lacks push access).
- **2026-09-30 · Claude (session 3).** Branch `claude/quick-check-watchlist`: AI-free quick checks, watchlist, per-holding decisions, decision journal, quick-screen, sensitivity grid, portfolio-first home, product strategy doc. 123 tests. Not pushed; delivered as patch series.
- **2026-09-30 · Claude (session 2).** Vercel protection → All Deployments. Branch `claude/p0-lockdown-and-valuation`: P0 cost guard, deterministic DCF valuation, diversification check, zero-cost track record, CI. 106 tests. Not pushed (session lacks repo push access); delivered as patch series.
- **2026-09-30 · Claude.** Reviewed the codebase and added `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md` and `docs/REVIEW_2026-09-30_claude.md`. No product code changed.
- **2026-09-25 · Codex.** Last feature commit `2e26aed`: peer valuation inputs and reference limitations.

- **2026-10-06 · Codex privacy delivery.** PR #13 merged as `b3a26cd`, code `68084dd`. Default-hidden portfolio numbers with fixed ten-minute reveal, navigation retention, manual hide and reload reset. 183 tests, types, build, CI and both preview/production checks pass. Local and live browser behavior verified; drafts preserved. No private financial values recorded. Security PR #11 and brokerage reconciliation remain open. Baton released.
