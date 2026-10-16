# Architecture

```text
prompts/*.jsonl ──► config.load_episodes
channel.json    ──► config.load_channel
                         │
        ┌────────────────┼──────────────────────┐
        ▼                ▼                      ▼
 veo_prompt.py     copywriter.py          captions.py
 (character block  (mock | anthropic)     (SRT/ASS, ffmpeg burn)
  + scene + 9:16)        │
        │                ▼
        │          platforms.py  (youtube / tiktok / instagram packs)
        │                │
        └───────► scoring.py  (blocking + advisory lint)
                         │
                   schedule.py  (publishAt in UTC, only READY episodes)
                         │
 video_providers.py (manual | veo)    publish_youtube.py (private + scheduled)
        ▲ both gated by --execute
```

Decisions:

- **Deterministic first.** Everything except copy quality is plain code, so evals run free and offline. The model only writes hooks, and its output passes the same lint.
- **Character consistency is enforced, not hoped for.** The block is pasted verbatim and `character_block_verbatim` blocks any prompt that drifted.
- **Money and publishing are opt-in.** Rendering and uploading require `--execute`; uploads are private and scheduled.
- **Cost standard.** The Anthropic copywriter puts the stable system prompt first, sets `cache_control`, caps `max_tokens` at 600, and defaults to the cheapest model.
- **Provider seams.** `video_providers.py` is where Higgsfield, Runway or Kling would plug in.
