import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.captions import timed_lines, to_srt
from app.config import load_channel, load_episodes
from app.copywriter import MockCopywriter
from app.pipeline import plan_episode
from app.schedule import build_schedule

BASE = {
    "id": "t1", "scenario": "Bubbles glares at a laptop.", "dialogue": ["I need a nap."],
    "hook_text": "Monday again", "title": "Monday again 😴", "topic_tags": ["#Monday"], "clip_seconds": 8,
}
LONG_LINE = " ".join(["word"] * 25)


def plan(channel, used=(), **overrides):
    episode = {**BASE, **overrides}
    return plan_episode(channel, episode, MockCopywriter(), list(used))


def main():
    channel = load_channel()
    results = []

    def case(name, passed, detail=""):
        results.append((name, bool(passed), detail))

    ok = plan(channel)
    case("happy path is ready", ok["report"]["ready"] and ok["report"]["score"] == 100, ok["report"]["blockers"])
    case("character block is verbatim in prompt", channel["series"]["character"]["block"] in ok["prompt"])
    case("prompt is vertical with no on-screen text", "9:16" in ok["prompt"] and "Do not render any text" in ok["prompt"])
    case("#Shorts pinned in YouTube tags", "Shorts" in ok["packs"]["youtube"]["tags"])
    case("hashtags capped at 5", len(ok["packs"]["youtube"]["tags"]) <= 5)
    case("AI labels on for all platforms",
         ok["packs"]["youtube"]["containsSyntheticMedia"] and ok["packs"]["tiktok"]["ai_generated_content_label"]
         and ok["packs"]["instagram"]["ai_label"])
    case("uploads default to private", ok["packs"]["youtube"]["privacyStatus"] == "private")
    case("adult series is not made-for-kids", ok["packs"]["youtube"]["selfDeclaredMadeForKids"] is False)

    long_title = plan(channel, title="When HR calls you into a hostile work environment 📉")
    case("53-char title is blocked", "title_length" in long_title["report"]["blockers"])
    too_wordy = plan(channel, dialogue=[LONG_LINE])
    case("dialogue too long for clip is blocked", "dialogue_fits_clip" in too_wordy["report"]["blockers"])
    dup = plan(channel, used=["monday again 😴"])
    case("duplicate title is blocked", "title_unique" in dup["report"]["blockers"])
    brand = plan(channel, scenario="Bubbles meets Mickey from Disney.")
    case("trademark term needs review", "no_review_terms" in brand["report"]["blockers"])

    plan_ok = plan(channel)
    from app.scoring import lint_episode
    drifted = lint_episode(channel, {**BASE}, plan_ok["copy"], plan_ok["packs"], "Character: someone else", [])
    case("character drift is blocked", "character_block_verbatim" in drifted["blockers"])

    rows = build_schedule(channel, ["a", "b"], "2026-10-14")
    case("schedule converts 17:30 New York (EDT) to UTC",
         rows[0]["publishAt"] == "2026-10-14T21:30:00Z" and rows[1]["publishAt"] == "2026-10-15T21:30:00Z", rows)
    cues = timed_lines(["one two", "three four five six"], 8)
    case("caption cues stay inside the clip", cues[0][0] > 0 and cues[-1][1] < 8, cues)
    case("srt has numbered cues", to_srt(cues).startswith("1\n00:00:00,400 -->"))

    episodes = load_episodes(ROOT / "prompts" / "bubbles_batch.jsonl")
    titles, ready = [], 0
    for episode in episodes:
        result = plan_episode(channel, episode, MockCopywriter(), titles)
        titles.append(result["copy"]["title"])
        ready += result["report"]["ready"]
    case("shipped sample batch is fully publishable", ready == len(episodes), f"{ready}/{len(episodes)}")

    for name, passed, detail in results:
        print(f"{'PASS' if passed else 'FAIL'} {name}")
        if not passed and detail:
            print(f"  {detail}")
    passed_count = sum(1 for _, passed, _ in results if passed)
    print(f"\n{passed_count}/{len(results)} evals passed")
    raise SystemExit(0 if passed_count == len(results) else 1)


if __name__ == "__main__":
    main()
