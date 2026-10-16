# UX rebuild plan — 2026-10-16

Source: Venkat's feedback after trying v0.15.0. Blanket approval to rework requirements, UX and features end to end. No trades, no advice claims, no fabricated data; deterministic math stays in code; paid calls stay capped.

## What is wrong (root causes found in the code)

| Complaint | Root cause |
|---|---|
| "No past research from the last 3–4 weeks" | The archive is keyed to an anonymous per-browser cookie (`research_workspace`). A new browser, device, cleared cookies or a different URL starts an empty history. Browser-only copies live in `localStorage` of one browser. |
| "Two logins; owner key mimics a login" | Vercel Deployment Protection, plus a shared secret (`OWNER_ACCESS_KEY`) for brokerage data. Neither identifies a person, and the history is not tied to either. |
| "Most stocks I own have no prediction or research" | Holdings are shown from a tab-only brokerage refresh. Nothing ties a holding to its latest report, and no flow researches the holdings you own. Research runs one ticker at a time from a search box. |
| "Inconclusive means nothing" | The score is withheld (`Research incomplete`, `Older report · rerun`, `Valuation incomplete`) whenever a factor is missing or the price is over 7 days old. The result is a non-answer that looks like a verdict. |
| "Hard to navigate" | Portfolio, Activity, Watchlist, Discover, Compare, Holdings, Accounts, Performance are separate pages with overlapping jobs. The stock is not the organizing unit. |
| "Decision journal is pointless" | It is manual, browser-local and graded against whichever price happened to be seen last. It has no link to a research verdict. |

## Why chat feels better than the tool

A chat answer always commits to a view and uses whatever it finds. The tool deliberately refuses to commit when evidence is missing, and it only researches what you search for. The fix is not to loosen the evidence rules; it is to always return a clear verdict *with a stated confidence and the exact evidence that is missing*, and to research the stocks you own by default.

## Target experience

1. **Sign in with Google.** One account-based identity. Only emails on an allowlist (`OWNER_EMAILS`) get in. History, watchlist and journal belong to the account, so they follow you across browsers and devices. The old anonymous workspace is claimed into the account on first sign-in from the browser that has it.
2. **My stocks is the home page.** One table of everything you own or follow: ticker, verdict, score, confidence, expected 12‑month range, last researched date, one action button. Holdings come from the brokerage refresh; followed stocks from the watchlist. Sorted by what needs attention.
3. **Every stock always has an outcome.** A research outcome is one of **Buy / Add**, **Hold**, **Trim**, **Sell / Avoid**, each with a *confidence* (High / Medium / Low), the *top reasons*, *what would change it*, and the *evidence still missing*. Low confidence is allowed; "no answer" is not. If a stock has never been researched the row says so and offers one-click research.
4. **Research the holdings I own.** "Research unresearched holdings" queues stocks one at a time, shows the number of reports and the daily cap before starting, and never exceeds the cap.
5. **History per stock.** Opening a stock shows its timeline of reports with verdict changes and what changed, plus the free price move since each verdict.
6. **Journal that writes itself.** Each research outcome becomes a dated, frozen prediction. Outcomes are graded later against price. You can record what you did in one click.
7. **Simple navigation.** My stocks · Research (all reports) · Discover · Journal · Settings. Compare, holdings import and accounts live under Settings or inside a stock.

## Delivery plan

| Phase | Scope | Needs from Venkat |
|---|---|---|
| **A. Account sign-in + durable history** (PR 1) | Google OIDC code flow, signed session cookie, email allowlist, route gating, archive keyed by account, claim of the legacy workspace, brokerage refresh gated by the same session, sign-in page. | Create a Google OAuth client, set 4 Vercel env vars (see `docs/GOOGLE_SIGNIN_SETUP.md`). Until then the app behaves as before and shows a banner. |
| **B. Conclusive research outcome** (PR 2) | New outcome model: verdict + confidence + reasons + what changes it + missing evidence, computed in code from the existing six factors; a provisional score when factors or price are missing; every report page and list uses it. Old reports get an outcome computed on read, not rewritten. | None |
| **C. My stocks home + nav** (PR 3) | Stock-centered home, per‑stock timeline, simplified nav, followed stocks stored on the account. | None |
| **D. Research the holdings I own** (PR 4) | Queue with cap awareness and cost preview, confirmation before spending, progress, resumable. | One tap to approve each batch (spends API credits). |
| **E. Journal that writes itself** (PR 5) | Auto-entries from outcomes, one-click "I did this", grading against price, account storage. | None |

Each phase ships behind passing tsc, tests and build, with HANDOFF/Notion updated.

## Not changing

Six-factor weights and thresholds, source-membership checks, citation validation, immutable snapshots, the daily cap, server-only secrets. Verdicts are research outputs, not personalized advice.
