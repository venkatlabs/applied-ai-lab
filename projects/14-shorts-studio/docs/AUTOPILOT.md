# Autopilot: a recurring content pipeline

```text
 trends.py ──► ideas.py ──► pipeline.plan ──► render ──► captions ──► REVIEW ──► publish
 Google Trends  episode      Veo prompt +     Veo API    speech-timed   YOU      private +
 YouTube popular records     copy + lint      or Flow    ffmpeg burn    approve  scheduled
 topics.txt                                   by hand
        every step records status in out/state.json
```

## What is and is not automatable

| Step | Automated? | Notes |
|---|---|---|
| Trend discovery | Yes | Google Trends RSS (no key) and YouTube mostPopular (`YOUTUBE_API_KEY`). Unsafe topics (tragedy, politics, health scares, real people) are filtered. Falls back to `topics.txt`. **Live fetchers are unverified**; the build sandbox blocks both hosts. |
| Episode ideas | Yes | `--ideas mock` is templated; `--ideas anthropic` writes fresh gags and varies the joke shape. |
| Video render | **Gemini API, not Flow** | Flow has no public API. Automation uses Veo through the Gemini API (`GEMINI_API_KEY`), which is billed per second of video, separately from any Flow plan. Or render by hand in Flow and drop `raw.mp4` into the folder. |
| Captions | Yes | Timed from the clip's actual speech (ffmpeg loudness), not guessed. |
| Approval | **Always a person** | Nothing auto-approves. See "Why a review gate". |
| YouTube upload | Yes, with a catch | Uploads as private + `publishAt`. Projects that have not passed YouTube's API compliance audit are locked to private, so the final "make public" click stays manual in Studio until you pass it. Quota is about six uploads per day. |
| TikTok / Instagram | No | Copy from `tiktok.json` / `instagram.json`. |

## One-time setup

1. `GEMINI_API_KEY` from Google AI Studio, with billing on.
2. Set `veo.price_per_second_usd` in `channel.json` from Google's current Veo price page. **Rendering refuses to run while it is blank**, and `veo.max_budget_usd_per_run` stops a cycle at your cap.
3. `pip install google-genai` (Veo) and, for uploads, `pip install google-api-python-client google-auth-oauthlib` plus a YouTube OAuth client (`YOUTUBE_CLIENT_SECRETS`).
4. Optional: `ANTHROPIC_API_KEY` for better ideas and titles.

## Weekly loop

```bash
python3 -m app autopilot --count 5 --ideas anthropic --copywriter anthropic --live-trends           # plan only, free-ish
python3 -m app autopilot --count 5 --ideas anthropic --copywriter anthropic --live-trends --execute --max-clips 5   # also render
python3 -m app review                    # list clips waiting, with paths to watch
python3 -m app approve <id> [<id> ...]   # or: reject <id>
python3 -m app publish-approved          # dry run
python3 -m app publish-approved --execute
```

No Veo key yet? Run `autopilot` (plans only), render each `prompt.txt` in Flow, save as `out/<id>/raw.mp4`, then `python3 -m app ingest`.

To make it periodic, schedule the plan/render step (not publish), for example Mondays at 9:

```cron
0 9 * * 1  cd /path/to/applied-ai-lab/projects/14-shorts-studio && python3 -m app autopilot --count 5 --ideas anthropic --live-trends --execute --max-clips 5
```

Then review on your phone or laptop and approve. Publishing stays a deliberate command.

## Why a review gate

Fully unattended, trend-chasing, AI-generated daily uploads are the pattern YouTube's "inauthentic content" policy targets, and an unsupervised model can also pick an off-tone joke on a sensitive trend. The gate costs about a minute per episode and protects the channel's ability to earn. It also catches the weak 8-second clips: lip-sync slips, odd props, still-faced openings.

## Cost controls

- Plan-only is the default; rendering needs `--execute`, a configured price, and stays under `max_budget_usd_per_run`.
- `--max-clips` caps renders per cycle (default 1).
- Spend is accumulated in `out/state.json` (`spend_usd`). Set a billing alert in Google Cloud too; the ledger is an estimate.
