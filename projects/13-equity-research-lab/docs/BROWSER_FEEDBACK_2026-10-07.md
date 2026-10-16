# Connected holdings and research completion

## User outcomes

- My holdings starts with a dropdown of accounts in the latest connected refresh. Choosing one loads only its reported total, available cash and supported holdings. All accounts remains an option. The selected account scopes the shared portfolio home, holding review and comparison tools.
- Last refresh is the app retrieval timestamp. Holdings date and last provider sync are shown separately; retrieving an account does not imply its brokerage prices are live. Connected values are read-only.
- Manual snapshots and file imports are collapsed below holdings and portfolio guidance. They remain available for recovery. Saved manual data is not shown as the latest connected state.
- Activity opens Saved research. Research outcomes follows; Decision journal is optional and last. The journal embedded in holdings is collapsed; saved entries are preserved.
- A user-started full report automatically makes at most one targeted follow-up if a verified quote exists and a directional decision still lacks evidence. Incomplete archived reports offer Complete research. New reports have an explicit completion state and remaining evidence gaps.

## Research limits and credits

Each new report, including the follow-up, reserves a daily research slot before paid calls. The follow-up focuses on the missing fields, limits web search to three calls, and produces a new immutable report rather than modifying history. It performs fresh provider reads and one synthesis; it does not recursively restart itself. Same-day finished follow-ups are reused, including failed syntheses, to avoid repeating costs. Explicit fresh-report requests still use the existing daily budget. GET never starts paid research. Provider failure or budget rejection keeps the first report available.

Missing valuation is a data/method blocker, not proof that a stock is unattractive. Positive cash earnings, growth forecasts, balance-sheet inputs or comparable sector evidence may be genuinely unavailable. The tool must stop with the exact gaps rather than invent a Buy/avoid decision. A foreign-filer data defect was corrected: USD balance-sheet facts in 20-F/40-F and 6-K filings can supply cash and debt; absent debt is never inferred as zero. IFRS-specific tags and normalized valuations for loss-making/high-investment businesses remain incomplete.

## Validation

196 tests, TypeScript and production build pass. Tests cover selected-account isolation/timestamp preservation, completion eligibility and termination, POST budgeting/reuse, the targeted search cap and foreign-filer cash/debt extraction. A synthetic two-account browser fixture verified isolated/combined holdings and shared scope, read-only dates, collapsed import/journal and 320px fit. Local production browser verified connected-first empty state, optional import expansion and Saved research as the Activity default. No private records were saved to GitHub or Notion. Live deployment/provider verification is recorded in HANDOFF.md.
