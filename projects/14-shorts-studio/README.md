# Project 14: Shorts Studio

Turn a file of episode prompts into publish-ready AI Shorts: a Veo prompt with a locked character block, titles, descriptions and hashtags for YouTube / TikTok / Instagram, burned-in captions, a posting schedule, and a lint that blocks weak episodes before they cost a render.

Built around the `@social-guru` "Bubbles the Baby CEO" series, but everything series-specific lives in `channel.json`.

## Quick start (no API keys, no cost)

```bash
cd projects/14-shorts-studio
python3 -m app plan                       # prompts/bubbles_batch.jsonl -> out/
python3 evals/run_evals.py                # 17 checks
```

`plan` writes, per episode, into `out/<id>/`:

| File | Use |
|---|---|
| `prompt.txt` | Paste into Google Flow / Gemini / AI Studio (9:16). Character block is verbatim. |
| `youtube.json` | Title, description, tags, `#Shorts`, AI-content flag, private by default |
| `tiktok.json`, `instagram.json` | Captions, 3-5 hashtags, AI labels |
| `captions.srt` / `captions.ass` | Large yellow outlined captions for the safe zone |
| `report.json` | Lint checks, score, blockers |

A pre-generated copy is committed in [examples/sample-output](examples/sample-output/ep01-baby-ceo/prompt.txt) so you can view the files on GitHub without running anything.

plus `out/schedule.json` (daily slot, local and UTC) and `out/summary.json`.

## Daily workflow

```bash
python3 -m app plan prompts/my_batch.jsonl --start 2026-10-14
# render each prompt.txt in Flow, save as out/<id>/raw.mp4
python3 -m app captions                   # raw.mp4 -> final.mp4 (ffmpeg)
python3 -m app publish-youtube            # dry-run: shows what would upload
python3 -m app publish-youtube --execute  # private + scheduled upload
```

TikTok and Instagram are manual for now: copy from `tiktok.json` / `instagram.json`.

## Episode file format (`prompts/*.jsonl`)

```json
{"id": "ep07-example", "scenario": "What we see.", "dialogue": ["What Bubbles says."],
 "hook_text": "<=6 words", "title": "optional <=50 chars", "topic_tags": ["#Niche"], "clip_seconds": 8}
```

Omit `title` to let the copywriter write one. `--copywriter anthropic` (needs `ANTHROPIC_API_KEY`) writes sharper hooks; the same lint still gates the output.

## What the lint checks (and what it does not)

Blocking: title over 50 chars, duplicate title, dialogue too long for the clip, character block not verbatim, AI labels off, trademark/real-person terms. Advisory: hook length, opening line speed, `#Shorts`, hashtag count, CTA.

It is **not a view predictor**. It catches cheap, known mistakes. Reach is learned from posted results; see [docs/VIRAL_PLAYBOOK.md](docs/VIRAL_PLAYBOOK.md).

## Spending and safety defaults

- `generate --provider veo` is a dry run unless `--execute`, and renders at most `--max-clips` (default 1).
- Uploads are `private` with `publishAt`; nothing goes public instantly.
- AI-generated labels are on for all three platforms.

## Verification status

Verified here: planning, lint, schedule math, captions burned with ffmpeg, dry-run paths, 17 evals.
**Not verified (no credentials in the build environment):** the Veo adapter (`app/video_providers.py`), the YouTube upload (`app/publish_youtube.py`) and the Anthropic copywriter. Run each once on a single clip before trusting a batch.

## Layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
