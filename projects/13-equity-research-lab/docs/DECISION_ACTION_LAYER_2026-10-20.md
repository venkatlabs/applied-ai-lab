# Decision Action Layer — 2026-10-20

## Product outcome

The Equity Research Lab should optimize for one question:

> **Given the evidence, what should I review doing next, and why?**

Every connected-account refresh and every completed stock report should end with a compact, ranked decision-support output. The owner remains accountable for every investment decision and trade. The portal's job is to make the evidence, assumptions, conflicts, sizing constraints and missing information hard to ignore.

The action layer is deliberately downstream of research. It does not create a second stock score and it does not place trades.

## Decision contract

Use one stable action vocabulary:

- **BUY / ADD CANDIDATE** — research supports adding and there is room under the portfolio policy.
- **HOLD** — no portfolio or research reason to change now.
- **HOLD — DO NOT ADD** — thesis may remain intact, but concentration or valuation blocks more exposure.
- **TRIM CANDIDATE** — concentration/valuation makes a reduction worth reviewing.
- **SELL / EXIT REVIEW** — the latest research is adverse enough to review leaving the position.
- **RESEARCH FIRST** — evidence is missing/stale; do not manufacture a directional answer.
- **WAIT / WATCH** — potentially attractive, but price/timing/evidence does not support an entry.
- **AVOID / DO NOT INITIATE** — adverse research for a stock not currently owned.
- **REVIEW FUND EXPOSURE** — fund look-through is required before calling the holding diversified.

Every output must show:

1. action candidate;
2. why, with the dominant reason first;
3. approximate policy-sized amount when it is mechanically derivable;
4. evidence source: recent full report, quick valuation, or portfolio rule;
5. portfolio weight / concentration context;
6. tax context when average cost is known, without pretending average cost is a tax lot;
7. blockers / missing data;
8. what would change the decision when the research report contains that condition;
9. no automatic trade.

## What this PR implements

### 1. Ranked action queue after a portfolio/account refresh

A deterministic `portfolioActionPlan` reuses `adviseHoldings` rather than creating a second scoring model. Risk-reduction reviews rank ahead of add candidates, then missing-research items, then monitoring.

The connected-account page ends with **Next actions from this account refresh** when the returned accounts can be safely combined. The Portfolio home also shows the ranked queue.

### 2. Final action at the end of every stock report

A completed stock report now ends with a **FINAL NEXT STEP** section. For an owned stock it combines the report with the current portfolio. For an unowned stock it combines the research verdict with available portfolio room. Missing portfolio context is surfaced rather than guessed.

### 3. Preserve connected average cost

The connected-account bridge now preserves a weighted average cost only when every combined position for that ticker reports valid cost basis. It drops the average rather than mixing known and unknown basis.

This makes rough gain/loss context possible, but it is intentionally **not** called tax-lot accounting.

## Missing pieces found

These are not optional polish. They are required before the portal can be trusted as a complete decision system.

### P0 — tax-aware decisions

Build **Tax Alpha / Harvest Intelligence**:

- actual tax lots and acquisition dates;
- short-term versus long-term gain/loss by lot;
- realized gains/losses YTD;
- 61-day cross-account wash-sale graph (30 days before + sale day + 30 days after);
- taxable vs Roth/IRA/HSA/401(k) account location;
- recurring buys / managed-account buys that can create wash sales;
- spouse-account input when the owner chooses to include it;
- earliest clean harvest date;
- replacement-security review that does not claim an IRS safe harbor;
- estimated federal impact as a scenario, not a tax-return calculation.

Until those fields exist, the portal may say **tax-loss review candidate** but must not say **harvest now**.

### P0 — account identity and tax location

The current combined portfolio intentionally flattens accounts. A decision system needs to know whether each share is taxable, retirement, HSA, custodial or managed. Recommendations can differ materially by account.

Keep household exposure aggregated for risk, while preserving account-level attribution for execution/tax reasoning.

### P0 — fund look-through and duplicate exposure

A portfolio with VTI/QQQ/SMH plus direct NVDA/AVGO/TSM is more concentrated than ticker counts imply. Add:

- top underlying fund holdings;
- direct + indirect company exposure;
- sector/factor overlap;
- effective exposure after ETF overlap;
- stale/missing look-through warnings.

### P0 — personal portfolio policy

Move the editable policy from scattered defaults into one explicit profile:

- maximum single-stock exposure;
- sector/theme cap;
- crypto cap;
- minimum cash / emergency / tax reserve;
- margin allowed (default zero for the current owner);
- speculative sleeve cap;
- target retirement vs taxable allocation;
- liquidity needs / known near-term reserves.

Recommendation sizing must use the policy; the stock score must not.

### P1 — destination and funding logic

A trim is incomplete unless the portal answers **where should the proceeds go?** An add is incomplete unless it answers **what funds it?**

For every proposed change compare:

- keep;
- trim/add amount;
- destination/funding source;
- post-change weights;
- concentration/factor impact;
- estimated tax drag when available;
- cash-buffer effect;
- expected scenario trade-off using only validated models.

### P1 — opportunity ranking

After holdings are handled, rank unowned candidates against the portfolio:

- research quality;
- valuation;
- expected scenario asymmetry;
- portfolio diversification contribution;
- event/catalyst risk;
- liquidity;
- confidence/evidence completeness.

Do not rank merely by raw stock score. A lower-scoring stock can be a better portfolio addition if it reduces correlated risk.

### P1 — event and market context

The existing Watch layer should feed the recommendation layer:

- earnings / investor day / regulatory decisions;
- macro/rate events when material;
- thesis triggers that fired;
- price move versus thesis change;
- recommendation expiration / next review date.

A recommendation should become stale automatically when its required evidence or price is stale.

### P1 — decision journal with actual owner action

Track separately:

- portal recommendation;
- owner decision (acted / modified / ignored);
- intended size and actual size;
- rationale;
- subsequent 30/90/180/365-day result;
- benchmark-relative result;
- whether the thesis or simply the price changed.

This is necessary to learn whether the portal improves decisions rather than merely producing persuasive prose.

### P2 — calibrated track record

Before trusting stronger recommendations, evaluate:

- hit rate by action type;
- excess return versus SPY / appropriate benchmark;
- drawdown avoided by trims;
- opportunity cost of sells;
- calibration of scenario weights;
- performance by confidence/evidence state;
- after-tax result when tax data is available.

Do not optimize thresholds on the same history used to claim validation.

### P2 — execution-quality inputs

Before a trade layer, add:

- bid/ask and spread;
- average volume / liquidity;
- volatility;
- order-size versus liquidity;
- market-hours state;
- earnings/event proximity;
- limit-versus-market guidance;
- options chain / IV / Greeks only when options are being considered.

## Path to trading

Trading is a separate capability and should be gated behind demonstrated recommendation quality.

### Stage 1 — decision support (now)

Research → portfolio context → recommended action candidate → user decides.

### Stage 2 — trade draft

The portal can turn an approved decision into a **draft trade intent**:

- account;
- ticker;
- side;
- shares/dollars;
- order type;
- limit/stop if applicable;
- tax lots if selling;
- expected post-trade allocation;
- estimated cash impact;
- pre-trade warnings.

No order submission.

### Stage 3 — broker review

Read live quote/tradability/buying power, rerun wash-sale/tax-lot and concentration checks, show the exact order preview. Require explicit user confirmation.

### Stage 4 — execution

Only after the owner explicitly confirms the reviewed order. Never infer confirmation from a prior research decision. Log order state and reconcile the filled trade back into the portfolio.

### Stage 5 — automation, only if ever justified

Automated trading should require a separately approved strategy, hard risk limits, kill switch, position/notional caps, no-margin default, audit log, deterministic guardrails and prospective validation. It is not part of the current roadmap.

## Recommendation hierarchy

When signals conflict, use this order:

1. **Data integrity / stale or missing evidence** — block precision.
2. **Portfolio survival / concentration / liquidity / margin** — risk constraints can override a good company.
3. **Tax and account constraints** — change timing/lot/account, not the underlying business score.
4. **Company thesis and evidence** — determines whether ownership is desirable.
5. **Valuation / expected return** — determines whether today's price is attractive.
6. **Timing / catalysts / technical execution** — determines how and when to act.
7. **Owner preference** — final decision and accountability.

This prevents a strong company score from becoming an automatic buy and prevents a red P/L from becoming an automatic sell.

## Definition of done for the recommendation problem

Do not call the problem “cracked” until:

- every account refresh ends with a ranked queue or an explicit data blocker;
- every stock report ends with one action candidate and a reason;
- the same ticker produces a consistent action across report and portfolio views;
- account/tax location is preserved;
- fund overlap is known or explicitly blocked;
- actual tax lots/wash-sale windows are modeled before tax-harvest recommendations;
- recommendations are frozen and later graded;
- threshold performance is prospectively evaluated against simple benchmarks;
- recommendation changes are traceable to new evidence, price, portfolio state or user policy;
- zero trades are placed without a separate reviewed trade intent and explicit confirmation.
