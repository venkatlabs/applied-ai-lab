# Contextual decision P0 (v0.15.0) — 2026-10-16

Implements P0 of `CONTEXTUAL_DECISION_SPEC_2026-10-16.md`. P1–P3 are not started.

- **Current-affairs cards** (`lib/current-affairs.ts`): the existing single synthesis call also returns up to six events (no extra paid call; same 9,000-token cap). Code keeps only events whose source URL is in this report's citation catalog and has a valid publication date not after the analysis date; source title, tier and retrieval time come from the catalog. Evidence kind is downgraded when scope or wording does not support it (non-company items cannot be direct company evidence; price-move causality becomes model interpretation). Items older than 90 days are flagged stale and cannot carry low uncertainty. Ranking: fresh before stale, direct before spillover before interpretation, newest first. Gaps are reported explicitly.
- **Score breakdown** (`lib/score-breakdown.ts`): reuses the exported `factorWeights`/`factorPoints` that compute the score; a test asserts the breakdown equals `singleInvestmentDecision(run).score`, and shows the valuation cap.
- **Decision header** (`components/DecisionHeader.tsx`): ticker, action, score, analysis date, current-affairs status; sticky on wide screens, static single column under 650px.
- Events do not change the score or verdict. Older saved reports show a clear "predates" state; snapshots are not rewritten.
- Web research prompt now asks for dated events in the last 90 days.
- Not verified: fresh live model output against real sources (needs one capped real report).
