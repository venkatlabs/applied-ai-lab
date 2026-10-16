# Portfolio home — October 6, 2026

## Approved outcome

Venkat chose Portfolio home after reviewing Portfolio home, Decision guide and Comparison workspace mocks. The main menu is now Portfolio and Activity, with Account settings as a utility. The portfolio is the starting point for owned holdings, new research and allocation changes.

## Delivered

- Homepage reads the connected tab snapshot first, otherwise the validated saved browser snapshot. It shows scope/date/source, total, stock/fund/cash mix, incomplete coverage, concentration and an editable single-stock limit.
- Compact holding rows reuse the existing deterministic advice, dated review status and latest saved report. Funds say Review fund exposure rather than implying assessed fund quality. Review and Compare change are beside each position.
- `/compare?symbol=…` reuses the six-strategy trim model and automatically loads the requested positive position from connected or saved holdings. Changing the holding loads it immediately. A custom multi-holding comparison is available in a collapsed section and loads its component only when opened, starting from the same connected or saved snapshot. Both private sources run locally without sending amounts to the simulation save service.
- Activity contains Decisions, Saved research and Research outcomes. Prior archive/performance/watchlist/holdings/simulation URLs remain available; no records are migrated or removed.
- Account refresh points back to the portfolio, replacing its three competing destinations. Research search says Review stock; its loading state accurately says it checks for saved research and does not spend credits.

## Limits

This is navigation consolidation using existing math and evidence policy, not a new allocation optimizer. New research still requires an explicit capped POST. Unknown ownership needs a recorded dated position (including explicit zero) for report-level add calculations. Fund look-through, tax lots, permanent connected storage, personal XIRR/TWR and predictive validation remain separate work. Connected data remains tab-only, and the account-security PR #11 remains separate and untouched.

## Verification

TypeScript, 180 existing tests and production build pass. Local production browser checks used an explicitly synthetic $100,000 scope with MSFT 45%, VTI 40% and cash 15%. Home correctly showed concentration and partial coverage, and one click automatically loaded MSFT into six matched-path comparisons. Activity journal, archive browser fallback and research outcomes loaded. Homepage fits 320px without horizontal overflow and was inspected at 1024px. No live brokerage calls or paid research. Cloud archive is unconfigured locally (503); its visible browser fallback worked. Deployment verification is recorded in HANDOFF.md.
