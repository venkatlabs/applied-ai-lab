# Evals

The first deterministic eval is `tests/scoring.test.ts`.

Before calling the research agent production-ready, add at least three point-in-time fixtures:

1. a high-quality / high-valuation compounder,
2. a cyclical company with improving expectations,
3. a company where headline sentiment conflicts with deteriorating fundamentals.

Each fixture should assert score stability, source timestamps, no look-ahead data, scenario completeness, and retrospective return math.

## Fixed evaluation cases (added 2026-10-22)

`manifest.json` lists seven saved-report fixtures in `fixtures/` with the expected verdict, confidence, score range, hurdle result, source coverage and date issues. `tests/eval-fixtures.test.ts` runs them in CI, so a change to the outcome rules, hurdle price, source-coverage check or trigger seeding that moves any verdict shows up as a failing case. Fixtures are synthetic and contain no real company facts; add a new case whenever a real report exposes a wrong or confusing result. They use no paid calls.
