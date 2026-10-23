# Morning preparation — 2026-10-23

Requested by Venkat: each morning, refresh research on the most concentrated holdings (currently AMZN, NBIS, NVDA), check whether each is worth holding or reducing with concentration in mind, also search new stocks across industries, and have it all ready before 7:30.

## What runs
`/api/cron/morning` (Vercel Cron, 12:00 UTC daily = 5:00 a.m. Pacific in daylight time, 4:00 a.m. in winter; the early start leaves time for the reports). Authenticated by `CRON_SECRET`, off until `MORNING_RESEARCH_ENABLED=true`.
1. Reads your Fidelity and Robinhood holdings server-side (the same read-only SnapTrade connection as Settings; requires `SNAPTRADE_PORTAL_ENABLED=true`) and finds the three largest stock positions by weight. `MORNING_PINNED=AMZN,NBIS,NVDA` can pin names instead. If holdings cannot be read it falls back to the pinned list or the last brief's names.
2. Researches those three in parallel (a same-day report is reused, never paid for twice), then up to two new names (`MORNING_DISCOVERY`, default 2) picked by rotating through the 13 industry groups in `lib/peer-valuation.ts`, skipping anything you own, follow, or researched in the last 30 days. Discovery is skipped if the first three ran long.
3. Builds the **brief** shown at the top of My stocks: verdict and confidence per stock, what changed since the previous report, and for the concentrated names the multiple of your 10% single-stock limit, the share of the position you would sell to reach it (and an interim 25%), and the AI-infrastructure and semiconductor cluster weight. Percentages only; no dollar amounts or share counts are stored, and the percentages follow the Show/Hide numbers switch.
4. A verdict change writes an alert on Watch. The run is recorded under Job health.
5. Sundays: also writes the weekly digest (the separate digest cron was folded in to stay within two cron jobs).

## Cost and caps
Each new report is one paid report, charged to the shared daily cap (`RESEARCH_DAILY_CAP`, UTC day). `MORNING_RESEARCH_MAX` (default 5) limits the job. The job runs at 12:00 UTC and the UTC day ends at 17:00 Pacific in daylight time, so anything you run by hand between 7:30 a.m. and 5 p.m. shares the same cap: raise `RESEARCH_DAILY_CAP` (for example to 8) if you want room left. The brief shows the estimated cost when prices are configured. Weekends are skipped unless `MORNING_WEEKENDS=true`.

## Setup (owner)
1. Run `supabase/migrations/009_morning.sql`.
2. Deploy, then sign in once (this records your account so the job knows whose brief to prepare).
3. In Vercel Production set `MORNING_RESEARCH_ENABLED=true`, and raise `RESEARCH_DAILY_CAP` if you want room for manual reports. Redeploy.
4. Test it: Vercel → Settings → Cron Jobs → Run on `/api/cron/morning`, then open My stocks.

## Limits
- A scheduled function has a time limit (300 s here). Three reports in parallel normally fit; if they do not, the brief shows which stocks failed or were skipped and you can finish them with one tap on My stocks. Plan limits on cron precision and duration are Vercel's; tell me if the first runs show timeouts.
- Weights use broker-reported prices, which can lag by a day at one custodian; they are indicative.
- New-stock ideas are a rotation, not a screen: they get a full report but no quick-valuation filter yet.
- Verdicts are research outputs, not personal advice.
