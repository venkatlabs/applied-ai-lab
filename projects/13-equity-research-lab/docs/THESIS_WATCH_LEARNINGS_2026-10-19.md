# What a friend's "Thesis Watch" teaches us — 2026-10-19

Source: a setup prompt for a Claude-built personal monitor (verdicts, five gates, pre-committed kill/upgrade triggers, event calendar, hurdle price, scheduled jobs). It is a prompt for a chat product with its own database and scheduler, not code we can import. We take the ideas that fit our stack and keep our invariants (no fabricated data, capped paid calls, deterministic math in code, immutable snapshots, no trades).

## Different jobs
| | Thesis Watch | Our tool |
|---|---|---|
| Core idea | Keep watching a few stocks you already believe in; tell me when a pre-agreed condition trips | Research any stock on demand; give a verdict with evidence |
| Cadence | Continuous: daily prices, event checks, weekly scans | Snapshot per report; nothing runs between reports |
| Output | Verdict + triggers + calendar + alerts | Verdict + confidence + reasons + five-case model |
| Weak spot | Needs a long interview and a stack of scheduled agent jobs; depends on LLM runs for every check | Silent between reports: nothing tells you a thesis broke |

They are complementary: our research is the front end, their monitoring is the missing back end.

## What maps onto what we already have
| Thesis Watch | Ours today |
|---|---|
| Verdict accumulate/wait/contested/avoid | Buy / Add, Hold, Trim, Sell / Avoid + confidence (`lib/outcome.ts`) |
| Gates G0–G4 | Six factors (growth, cash, valuation, competition, execution, market). G1 capital ≈ cash factor; G2 moat ≈ competition; G3/G4 had no explicit rules |
| Kill/upgrade triggers + review dates | `thesisReview` checks (observable condition + review-by date), but no status, no kill/upgrade split |
| Events calendar | Current-affairs cards (past events) + review dates; no forward calendar |
| Bear/base/bull + weights → expected return | Five-case distribution; no hurdle |
| Hurdle price / buy zone | Missing |
| Daily close, events desk, weekly scan, digest, alerts | Missing |
| "Never upgrade automatically", goalpost log | Partly: reports are immutable and verdicts only change on a new report. No goalpost log |

## Adopted now (this change)
1. **Hurdle price.** From the saved five-case model: the price at which its weighted 12-month value earns a 15% annual hurdle (`lib/hurdle.ts`). My stocks and the report now say "Needs a price at or below $X" or "Clears your hurdle". Weights are assumptions, not probabilities, and the text says so. It never changes the verdict.
2. **Stricter evidence standards in the synthesis prompt** (engine v0.15.1): check funding and dilution first; owned versus rented advantage; split price versus volume and structural versus cyclical growth and back out one-time or non-operating gains; company-defined metrics and management claims are not evidence; press and analyst items are watch items only. No schema or extra paid call.

## Recommended next, in order (not built; needs your go)
1. **Triggers with status** (kill/upgrade, armed/watch/tripped) stored per stock on the account, seeded from the report's `thesisReview` checks and `thesisKillers`, with a goalpost log whenever a kill trigger is loosened or removed. Pure data model plus UI; no agent needed. Also lets you pre-commit before buying.
2. **Event calendar** across your stocks from review dates and dated events, grouped by week.
3. **Free daily monitor** (Vercel cron, no LLM): refresh prices from the existing quick-check provider within its daily quota, recompute hurdle/buy-zone crossings and price-based triggers, and write alerts. Needs a `CRON_SECRET`, an authenticated route and the account-owned stock list (already built).
4. **Weekly digest** of what changed (verdict changes, triggers tripped, events due), shown in the app and optionally emailed.
5. **Capped event checks** (paid): when an earnings date passes, run one targeted refresh on that holding. Opt-in, bounded by the daily research cap.

## Deliberately not adopted
- Artifact database and agent-run scheduled jobs for every check: we have a real backend and caps; use code for deterministic checks and spend LLM calls only when you ask or an earnings date passes.
- Hurdle as a verdict input. It stays an overlay so the six-factor score and thresholds remain the single decision rule.
- Optional news feed, options income tracker and retrospective jobs: out of scope until the core loop is useful.
