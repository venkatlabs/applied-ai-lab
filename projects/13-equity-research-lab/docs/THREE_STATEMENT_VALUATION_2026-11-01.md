# Equity Research Lab v0.5 — Three-statement evidence and valuation (2026-11-01)

Source concept: [Equity Research Guide](https://docs.google.com/document/d/1WZHtwhMuAUrIDB9OHcCyi4Wn-LvTP2aJPEzd3bSLhwY/mobilebasic).

## What is implemented on this branch
- `lib/three-statement-model.ts` implements a deterministic, explicitly parameterized three-statement projection: income, operating/investing cash flows, assets, liabilities, equity and balance-sheet reconciliation.
- A terminal FCFF-based enterprise DCF yields an indicative equity value and price per diluted share. Distinguishes FCFF from the existing equity cash-flow proxy in `lib/intrinsic-valuation.ts`.
- Invalid or missing core inputs are rejected. No provider call, new expense, account access, tax processing or trading.
- `tests/three-statement-model.test.ts` covers reconciliation, no-double-count bridge, deterministic outputs and error cases.

## Review changes (Claude, 2026-11-03)
- Terminal cash flow is rebuilt for the first year after the forecast (revenue at the terminal rate, final-year margin/depreciation/capex ratios, working capital reinvested at the terminal rate) instead of growing the final year's FCFF. Exposed as `terminalFreeCashFlow`.
- Rejects openings where PP&E plus net working capital exceeds otherAssets, and forecasts where projected otherAssets go negative.
- Tests now include an independent hand calculation of the example (per share 20.06) and the new guards. 366 tests pass.
- Capex above depreciation in perpetuity remains an assumption the caller must review.

## Not yet implemented — do not claim live integration
1. **Input assembly:** dated SEC filings and verified share/market data mapped to auditable model inputs. Opening otherAssets must include PP&E and be consistent with starting working capital. Never synthesize a balance sheet from incomplete FMP fields.
2. **Financial sector model:** banks and insurers require sector-specific valuation; do not run this corporate DCF.
3. **Valuation QA:** distinguish equity cash flow and FCFF, build terminal capex/working-capital normalization and SBC/dilution, debt schedule, interest tax shield and loss carryforwards before labeling underwriting-ready.
4. **Portal UI:** stock report model tab with assumptions, annual three statements, DCF sensitivity, current evidence date, blockers and source links. Wire only verified inputs. Do not replace the existing research verdict or action vocabulary until tested.
5. **Case studies:** backtest AMZN and NBIS against actual dated filings. NBIS may be a negative FCF company, in which case this model must clearly withhold a target rather than invent one.
6. **Exports:** one editable Excel financial workbook and one DOCX initiation report; charts and presentation quality are P2 after input quality.
7. **Validation:** run `npm ci && npx tsc --noEmit && npm test && npm run build` in a checked-out workspace, plus production smoke tests after merge. Connector-only edit cannot execute the repository test suite here.

## Responsible follow-up for Claude
Use the repo `AGENTS.md` and `HANDOFF.md` baton. Verify baseline before changes. Review this PR, run CI/local build/tests, fix any issues, and integrate verified SEC inputs into a guarded report view. Document results in HANDOFF and mirror Notion Handoff log. Do not add a second score engine or live trades. Keep provider/LLM budgets unchanged. Only merge after all gates pass.
