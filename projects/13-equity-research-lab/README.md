# Equity Research Lab

A personal, evidence-first equity research system that does three things:

1. **Discover** companies worth deeper work.
2. **Research** business quality, expectations, valuation, analyst evidence, sentiment, risks, catalysts and options context.
3. **Learn** by freezing every prediction and grading it later against realized returns.

> This is a research tool, not an automated trading system. It does not place trades and should not be treated as personalized investment advice.

## What is already implemented

- Next.js + TypeScript portal with ticker entry and company research pages.
- Weighted 12-dimension research scorecard.
- Bull / base / bear cases and thesis-killer section.
- Analyst-intelligence table and live FMP/TipRanks adapter boundary.
- SEC company-facts adapter.
- Options strategy comparison boundary (shares / LEAPS / spread / no trade).
- Local immutable-ish browser archive for MVP development.
- Retrospective scoring logic and unit tests.
- Supabase/Postgres schema for durable research snapshots, sourced claims and 30/90/180/365-day retrospectives.
- Reusable skill specification in `skills/equity-research/SKILL.md`.

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`. Demo mode works without API keys. Try `NVDA`, `MSFT`, or `AMZN`.

## Live-data mode

Set:

```bash
NEXT_PUBLIC_APP_MODE=live
SEC_USER_AGENT="Equity Research Lab you@example.com"
FMP_API_KEY="..."
```

The SEC adapter uses the SEC ticker map and Company Facts API. The FMP analyst adapter uses the current stable TipRanks search and price-target-consensus endpoints.

## Source policy

The skill ranks evidence:

1. SEC / company primary disclosures
2. Exchanges, FINRA, Cboe, OCC and other market infrastructure
3. Professional data providers
4. High-quality journalism
5. Crowd / social sentiment

Every stored claim should preserve source URL, retrieval time and (when known) publication/as-of time. Historical retrospectives must only use information available at the original analysis timestamp.

## Architecture

```text
Next.js UI
   |
Research Engine
   +-- SEC provider
   +-- Analyst provider (FMP / TipRanks)
   +-- Options provider adapter
   +-- future price/news/positioning providers
   |
Archive
   +-- localStorage (MVP)
   +-- Supabase/Postgres schema (production)
   |
Retrospective evaluator
   +-- 30d / 90d / 180d / 365d
```

## Robinhood

The standalone website deliberately does **not** embed brokerage credentials or auto-trading. Personal Robinhood context can be added through a server-side connector/adaptor for holdings, quotes, watchlists and orders. Options-chain analysis should remain provider-abstracted because a full chain/Greeks feed is distinct from the account connector.

## Next milestones

- Durable Supabase persistence from the app instead of localStorage.
- Historical-price provider + scheduled retrospective evaluator.
- Full fundamentals normalization and multi-year trend scoring.
- Reverse-DCF implementation.
- Analyst reliability calculation by sector and point-in-time date.
- Live options chain / Greeks / IV percentile and strategy comparison.
- News/catalyst ingestion with source-quality weighting.
- Authentication and per-user portfolios/notes.
- Deployment to Vercel.

## Tests

```bash
npm test
```

## Deployment

1. Create a Supabase project and run the files in `supabase/migrations/` in numeric order.
   Migration `001_init.sql` is a legacy prototype schema the app does not use; migration
   `005_lock_legacy_001_tables.sql` enables RLS on its tables and revokes anon/authenticated
   access, so apply 005 to every project where 001 was ever run. See also the v0.6 backend
   setup below for 002.
2. Add the environment variables to Vercel.
3. Import this GitHub repo into Vercel and deploy.

The app can also be deployed immediately in demo mode with no database or paid market-data keys.

## Applied AI Lab conventions

This project lives at `projects/13-equity-research-lab/` inside `applied-ai-lab`.

- Demo mode works without paid credentials.
- Deterministic scoring/backtest work stays outside the model.
- Live research providers are bounded behind adapters so the UI and archive do not depend on one vendor.
- Before public deployment, add authentication, rate limits, spend alerts, and durable per-user storage.
- Follow the lab-wide [cost and prompt caching standard](../../docs/COST_OPTIMIZATION.md).

## Example research prompts

- `Analyze NVDA as of today. Separate business quality from valuation and tell me what expectations are embedded in the price.`
- `Analyze AMZN and focus on earnings revisions, FCF quality, AWS expectations, valuation, and the strongest bear case.`
- `Compare buying MSFT shares with no-trade and defined-risk options structures, but only if live options data is available.`


## v0.6 backend setup

Production uses `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and the server-only
`SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`. Never place secret/service-role
keys in `NEXT_PUBLIC_` variables. Apply `supabase/migrations/002_private_archive.sql`
in the linked Supabase project's SQL editor before deploying this release; it is
additive and independent of the legacy prototype schema in migration 001.

`ALPHA_VANTAGE_API_KEY` enables an end-of-day quote fallback after FMP fails.
`ALPHAVANTAGE_API_KEY` and the existing deployment spelling `ALPHA_VENTAGE_API_KEY`
are accepted aliases. FMP remains the estimate source. A quote does not supply EPS
forecasts or analyst targets. Supabase caches quotes for six hours and atomically
caps this application's Alpha Vantage calls at 24 per UTC day. Calls made outside
this application also count toward the provider allowance; upstream quota errors
are handled without fabricating data. No fallback requests are sent if persistent
quota accounting is unavailable.

Research is generated and inserted server-side; archive endpoints accept no client
report writes. Tables have RLS enabled and no anonymous/authenticated access.
Reads require the owner hash derived from a 256-bit HttpOnly SameSite cookie.
The raw workspace token is never stored in the database. Report inserts are immutable
through the application (no update/delete endpoint). Reopening a report does not
call market-data or AI providers. Reports retain their original quote dates and
research versions. The browser keeps a backup when local storage permits.

This is a private browser workspace, not account authentication. Cloud records survive
local-storage clearing, but clearing cookies or using another browser loses access.
Cross-device access and account recovery require a future authenticated account flow.
Old browser-only snapshots remain readable and are not uploaded automatically.


## v0.7 reader tools

Apply additive migration `003_reader_tools.sql` before deployment. It adds reversible
`deleted_at` archive state and private web-review storage. The application can update
only archive visibility, not the original snapshot payload. Bulk remove and restore
are owner-scoped and require a same-origin request; browser-only reports use local Trash.

New reports include a plain-English executive summary in the existing synthesis call.
Archived reports get a deterministic summary from saved data. Investment confidence
is the disclosed heuristic `round(research score * evidence confidence / 100)`, not a
profit probability. It does not override evidence gates or establish intrinsic value.

On-request web grounding uses the existing OpenAI key with `web_search`, up to three
tool calls and 3,500 output tokens (including reasoning). `OPENAI_WEB_MODEL` optionally
overrides the synthesis model. Requests have a persistent global limit of 20 and a
workspace limit of 3 per UTC day. Each saved report gets one immutable completed web
review; reopen to reuse it, or generate a new report for a new review. Failed attempts
count toward the daily budget. Inline API citation annotations are required, rendered
as clickable source links, and stored with retrieval time and actual token usage.
Web content supplements the report; it does not silently rewrite frozen ratings,
EPS estimates, option quotes, or original research.

Robinhood's official agent tools document options chains and quotes, but no brokerage
connection or credentials are configured in this portal. The options section provides
conditional shares/long-call/call-debit-spread comparisons and a deterministic manual
quote calculator. It assumes standard 100-share US contracts, displays maximum option
premium loss, break-even, expiry payoff and loss-budget checks, and discloses exercise,
assignment, liquidity and volatility risks. It never submits trades or claims that a
contract is currently available. Official references:
- https://robinhood.com/us/en/support/articles/trading-with-your-agent/
- https://robinhood.com/us/en/support/articles/360001227566/
- https://robinhood.com/us/en/support/articles/advanced-options-strategies/
- https://developers.openai.com/api/docs/guides/tools-web-search


### v0.8: one investment decision

New reports combine provider evidence with a cached, cited web brief before synthesis. The brief covers growth, cash/funding, valuation, competition, execution/governance and market risks. Each factor has a rating, dated source links and reasoning. Source presence/date checks establish provenance, not verified truth. The single directional investment score uses fixed weights (20/20/25/15/10/10) and a disclosed categorical mapping; it is not a calibrated probability. Missing core evidence withholds the score. Unknown valuation prevents buy calls; a negative verdict requires adverse evidence in the remaining factors. Old snapshots remain unchanged and show “Not rated” under the new method.

Automatic public company research is cached for one hour (UTC day in cache key), with up to six web tool calls, 5,500 output tokens and a 110-second timeout per uncached brief. Synthesis has a separate 110-second timeout. Routes allow 300 seconds. This uses the configured OpenAI account and adds cost to new reports; cache is best-effort across the deployment. Existing on-demand addenda retain their separate quota and do not retroactively rewrite frozen reports. No broker connection or live options chain is implied. Position/objective controls compare conditional strategies only; quotes and suitability still need review.
