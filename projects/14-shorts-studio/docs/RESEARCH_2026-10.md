# Research: what makes a Bubbles Short work (Oct 2026)

Prepared autonomously while the owner was away. Most sources are creator-tool blogs, not platform data, so treat numbers as heuristics. Nothing below has been validated on this channel yet; the measurement plan at the end is how we find out.

## What the research says

**Format.** The established AI-baby format is a baby face delivering adult content in an adult register, and the mismatch is the joke ([Anijam](https://www.anijam.ai/blog/how-to-make-ai-baby-videos/), [CapCut guide](https://www.capcut.com/resource/talking-baby-podcast), [Beehiiv tutorial](https://ai-for-real-life.beehiiv.com/p/how-to-make-ai-talking-baby-videos)). Bubbles already fits this. Sources claim large view counts without verified data.

**Distribution.** Shorts is now the main discovery surface on YouTube, with a reported 200B+ daily views ([Anijam trends](https://www.anijam.ai/blog/youtube-shorts-trends/)). YouTube's own measure is **viewed vs. swiped away** in Studio (Analytics > Content > Shorts). There is no official retention threshold; third-party cutoffs (70% watch-through, 40% swipe-away) are unverified ([vidIQ](https://vidiq.com/blog/post/youtube-shorts-algorithm/), [Bytecap](https://www.bytecap.io/research/youtube-shorts-retention-benchmarks)). Compare each Short with your own previous Shorts.

**Structure for 20-30 s.** Creator guides converge on: hook in about 1.5 s, one idea built with escalation, payoff 2-3 s before the end, and a last 1-2 s that loops or hard-cuts. About 2.5 words per second, every word load-bearing, no "thanks for watching" outro ([Subscribr](https://subscribr.ai/youtube-strategy/perfect-youtube-short-length-structure-hooks), [OutlierKit template](https://outlierkit.com/resources/youtube-script-template/)). Emotion beats information in the first 3 seconds; visual, low-dialogue comedy is rising ([Mean CEO trends](https://blog.mean.ceo/?p=10944)).

**Comedy that travels.** Relatable everyday scenarios are the most-shared category ([Fluxnote](https://fluxnote.io/guides/comedy-youtube-shorts-ideas), [AIR Media-Tech](https://air.io/en/youtube-hacks/13-types-of-shorts-that-always-go-viral-with-examples)). Pets and animals are a top format; I found no source that ranks baby content specifically. Recurring characters with callbacks and catchphrases build anticipation and community in TV and sketch comedy; no Shorts-specific evidence found.

**Veo prompting.** Put speech in quotation marks, write audio like screenplay direction, name what must not appear, and state audio explicitly or you may get silence or random effects ([LTX guide](https://ltx.studio/blog/veo-prompt-guide), [Magic Hour](https://magichour.ai/blog/how-to-prompt-for-speaking-in-veo-3)). Veo 3.1 accepts up to three reference images for consistency, and "extend" continues from the last second of a clip ([RunDiffusion](https://learn.rundiffusion.com/google-new-veo-3-1-model)); these are vendor claims, not verified against Google's docs. I found nothing reliable on lip-sync accuracy for babies.

**Policy risk.** YouTube's "inauthentic content" rule targets mass-produced or templated content with little variation, and enforcement now looks at whole channels: upload frequency, format similarity, lack of commentary and minimal editing stack up as risk signals ([AIR Media-Tech](https://air.io/en/news-air/how-youtube-treats-ai-in-2026-new-update), [Logie](https://logie.ai/news/youtube-ai-slop-crackdown-2026-monetization/)). One secondary source claims Partner Program thresholds double from Feb 1, 2027; unverified, check YouTube's policy page.

## What this changes

1. **Longer, multi-shot episodes.** Veo clips top out at 8 s, so an episode is 2-3 shots stitched together (target 18-24 s), structured hook / escalation / payoff.
2. **Two delivery modes.** `spoken`: Bubbles talks to camera (short line, mouth visible, face to lens). `voiceover`: a deadpan off-camera narrator while Bubbles' mouth stays closed. Voiceover sidesteps lip-sync, which was the weakest part of the first renders, and allows longer lines.
3. **No dead air.** Action and sound start on frame 0; the pipeline also trims any leading pause.
4. **Captions follow the actual audio** (word timestamps), not an estimate.
5. **Variation on purpose.** 29 different situations, not one template; recurring touches (Gerald the duck, "management", "Per my last email") reward regular viewers without making episodes interchangeable.

## Episode checklist (used to write `ideas/ideas_bank.jsonl`)

- One situation a viewer has lived (nap, grocery store, vet, Wi-Fi), with the baby-as-executive contrast visible in the first frame.
- Shot 1 hooks (line or action at 0.0 s, 8 words or fewer for spoken lines).
- Shot 2 escalates; shot 3 is the button, with a last line or image that invites a replay.
- Spoken lines are 12 words or fewer, spoken to camera with mouth unobstructed; voiceover lines 22 words or fewer.
- The joke works muted with captions, and in one second of viewing.
- No readable on-screen text, brands, real people, or tragedy; the character is "he".
- Structure differs from the previous five episodes.

## Cost

At the configured Fast price (about $0.15/s), a 20 s episode costs about $3 (the first paid test cost $1.20 for 8 s). The full bank of 29 episodes is about $87 before retries; retries are the real risk, so test two or three first and keep the monthly cap.

## Measurement plan

Publish 5-10 varied episodes, then read viewed-vs-swiped-away, average view duration and replays per episode in Studio. Keep the formats that beat the channel's own median; retire the rest. Do not scale rendering before that.
