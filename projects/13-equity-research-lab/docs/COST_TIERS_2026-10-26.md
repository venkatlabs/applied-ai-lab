# Research cost tiers — 2026-10-26

Reason: OpenAI charges rose and the bank started declining authorizations. A deep report makes two paid AI calls (web research with up to 6 searches, then a synthesis with up to 9,000 output tokens), and until now an automatic second paid follow-up could run after it. The morning job could also trigger five deep reports a day.

## The three tiers
| Tier | What it is | AI cost | When it runs |
|---|---|---|---|
| **Deep** | Full report with web research, rated verdict, scenarios | Paid | On demand, and for your top three holdings only when needed (below) |
| **Reuse** | The latest deep report stands; free daily checks keep running (price, hurdle, triggers, concentration) | None | Top holdings on days when nothing material changed |
| **Quick screen** | Filings, quote, modeled value, peer multiple, trend, balance sheet -> *Worth a deep look / Mixed / Skip for now*. Never a verdict | None | Every new idea, rotating screens of your other holdings, and any stock on demand |

## When a top holding gets a new paid deep report
A deep refresh happens only if: no deep report exists, the latest is 7 days old (`MORNING_DEEP_MAX_AGE_DAYS`), or the price has moved 7% since it (`MORNING_DEEP_MOVE_PCT`). Otherwise it is reused. Set `MORNING_DEEP_ALWAYS=true` for a literal new deep report every morning for the top three.

## Morning job, new defaults
- Top three by weight: deep or reuse as above. `MORNING_RESEARCH_MAX` (paid reports per run) now defaults to **3**.
- New ideas from different industries: free screens only (`MORNING_DISCOVERY`, default 2).
- Exit watch: free screens of two other holdings a day, rotating (`MORNING_EXIT_SCAN`, default 2); a weak screen on something you own is flagged for a paid deep look.
- Free screens have their own provider cap, `LIGHT_DAILY_CAP` (default 40), and never use the paid-research cap.
- "Prepare my brief now" plans first (free), tells you exactly how many paid reports it will run, and asks before spending.

## Other cost changes
- No automatic second paid follow-up after a deep report. "Seek missing evidence (paid)" is its own button.
- A run that fails because the OpenAI key is bad or out of credit returns its budget slot and saves nothing.
- A stock that has only been screened is listed in My stocks only if you own or follow it.

## Settings to protect your card (owner)
1. OpenAI dashboard -> Settings -> Limits: set a **monthly budget** with a hard stop. This is the only control that cannot be bypassed by a bug.
2. Vercel: `RESEARCH_DAILY_CAP` to 3 or 4 (paid deep reports per UTC day, shared by the morning job and your manual runs).
3. Optional: `RESEARCH_PRICING_JSON` with your model's dated prices so each report shows its estimated dollar cost (see `.env.example`).
4. Optional lighter deep reports: `OPENAI_MODEL` / `OPENAI_WEB_MODEL` to a cheaper model. Quality will change; compare a few reports first.

## Limits
- The quick screen is a coarse filter from the latest annual filing, consensus growth and prices. It does not read news, management or competition, so it can miss a bad story and flatter a stock with temporarily high profits.
- The price-move gate uses the report's recorded price and today's quote; filings or earnings that land between two quiet days will wait for the age limit.
