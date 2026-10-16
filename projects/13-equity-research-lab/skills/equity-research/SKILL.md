---
name: equity-research
description: Research listed companies and revisit personal portfolio buy, hold, trim or wait decisions using dated evidence and deterministic valuation.
---

# Equity Research Skill

Version: `equity-research-v0.15.0` (matches `lib/research-engine.ts` `skillVersion`)

## Purpose
Help the owner decide what to do with a stock (buy, hold, trim or wait) without mixing up business quality, valuation, market expectations and timing. Every conclusion is saved as a timestamped snapshot, so later reports and the decision journal can grade it.

## Principles
1. Primary sources first: SEC filings > market-data providers > reputable journalism > everything else. Never invent a figure, date or citation. Missing data stays visibly missing.
2. Timestamp every fact. Retrospectives use only point-in-time information; frozen snapshots are never rewritten.
3. A great company is not the same as a good stock at this price.
4. **Deterministic math lives in code**: valuation, scores, zones, concentration, grading. The LLM gathers and critiques evidence; it never sets the valuation or the score arithmetic.
5. State the strongest counterargument, what would change the view, and the downside.
6. Options are a separate decision. The stock score never selects a contract.
7. Research aid, not financial advice.

## Decision model (one scoring model)
Six factors, each rated Very weak / Weak / Mixed / Strong / Very strong / Unknown (mapped to 10/30/50/70/90, Unknown = 50):

| Factor | Weight | Who rates it |
|---|---|---|
| Growth potential | 20% | LLM, from cited evidence |
| Profit, cash and funding | 20% | LLM, from cited evidence |
| **Valuation** | 25% | **Code**: deterministic DCF (`lib/intrinsic-valuation.ts`). If a complete peer table disagrees, the more conservative rating wins (`lib/valuation-factor.ts`) |
| Customers and competition | 15% | LLM |
| Execution, governance, dilution | 10% | LLM |
| Market, rates, external risks | 10% | LLM |

A factor becomes Unknown when its sources aren't in the retrieved catalogue or its evidence date is stale (120 days for valuation/market, 460 for the rest).
A score requires ≥4 known factors including growth and cash, plus a price no more than 7 days old. Unknown valuation caps the score at 59.
Bands: ≥70 buy candidate · 60–69 watch for a better entry · 40–59 hold/wait · <40 avoid/review selling. These are policy thresholds, not calibrated probabilities.
Evidence coverage (0–100) is reported separately and measures completeness, not accuracy.

## Valuation (code)
- Equity cash-flow approximation: operating cash flow less capex, after interest, with zero net borrowing. Net income proxies are illustrative only and cannot supply a valuation signal.
- Growth: consensus revenue CAGR (clamped to −5%..25%) for 5 years, fading to 2.5% terminal by year 10.
- Discount rates: bear 10% / base 9% / bull 8%; growth shifts −4 / 0 / +3 points. These are required equity returns. Cash and debt are context only and are not added/subtracted again.
- Excluded: banks and insurers (use price/book peers). Cyclicals without normalization, missing forecasts, incomplete balance sheets and net-income proxies cannot supply valuation signals. Annual data must be dated and no more than 460 days old.
- Zones: Buy zone requires price ≤85% of base value (15% margin of safety), eligible inputs and a verified quote no more than seven days old. Missing, stale or future quotes are Not valued. Quick-check zones cannot override a recent full report holding/waiting.

## Tiers
- **Quick check** (no LLM): SEC + quote + consensus + DCF → zone and buy-below. Metered by `QUICK_CHECK_DAILY_CAP`, cached per ticker per day.
- **Full report** (LLM): adds a cited web-evidence brief and the six-factor synthesis. POST only, capped by `RESEARCH_DAILY_CAP`, reused same day. Reserve attempts atomically before provider calls; failed attempts count.

## Portfolio layer
Position decisions (`lib/position-advice.ts`) apply, in order: concentration vs the single-stock limit, then a full report from the last 30 days, then the quick-check zone. The decision journal records what was actually done and grades it against later prices.

## Output contract
The LLM returns `investmentCase` (six factors with reason, sources, evidence date, plus growth outlook, strongest counterargument, timing, change-my-mind), `executiveSummary`, highlights, risks, catalysts, management credibility, expectation gap, valuation summary (a critique of the code DCF), analyst summary and thesis killers. It also returns `thesisReview`: up to three dated, sourced observations, observable conditions for reconsideration, and sourced or explicitly suggested review dates, plus up to four evidence gaps. It does not return scores or valuations.

## Revisit the case
Read [thesis review guidance](references/thesis-review.md) for evidence checks, sector questions and personal portfolio context. The application validates source membership and calendar dates, withholds unsupported observations, and shows due reviews separately from evidence gaps. These checks do not change verdicts or trigger selling. Existing frozen reports remain unchanged.

## Five-case outlook
Put the unified rating and Buy/Hold/Wait reasoning first, followed by severe bear, bear, base, bull and severe bull outcomes for the next twelve months. Use a sourced earnings or enterprise-sales model only when appropriate; separate starting facts from forecast assumptions and explain growth, multiples, future diluted shares and financing. Code computes representative prices, returns and weighted outcomes. All weights are subjective assumptions, not validated probabilities or clinical odds. Never confuse analyst-target upside with probability of profit, or intrinsic DCF values with one-year prices. Missing model inputs remain explicit. The local scenario explorer lets the owner test hypothetical prices/weights without paid calls or changing the frozen report or investment decision.

Read [current affairs guidance](references/current-affairs.md) for dated event evidence cards. The application keeps only events tied to this report's own sources with valid publication dates, takes provenance from the citation catalog, and labels direct company evidence, sector spillover and model interpretation separately. Events never change the score or verdict.
