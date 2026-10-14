"""Publish-readiness lint.

This is NOT a view predictor. Nobody can predict virality offline. It checks
the rules we know are cheap to satisfy (length, hook placement, tags,
duplication, policy flags) so weak episodes are caught before they cost a
render. Reach itself is measured after publishing (see docs/VIRAL_PLAYBOOK.md).
"""
import re

REVIEW_TERMS = (
    "disney", "pixar", "marvel", "nintendo", "pokemon", "trump", "biden", "musk",
    "taylor swift", "kardashian", "cure", "guaranteed income", "get rich",
)


def words(text):
    return re.findall(r"[\w'’-]+", text)


def check(name, ok, detail, weight=1, blocking=False):
    return {"name": name, "ok": bool(ok), "detail": detail, "weight": weight, "blocking": blocking}


def lint_episode(channel, episode, copy, packs, prompt, existing_titles=()):
    limits = channel["limits"]
    dialogue_words = sum(len(words(line)) for line in episode["dialogue"])
    seconds = min(int(episode.get("clip_seconds", limits["clip_seconds_max"])), limits["clip_seconds_max"])
    speakable = int(seconds * limits["words_per_second"])
    yt = packs["youtube"]
    first_line_words = len(words(episode["dialogue"][0]))
    title = copy["title"]
    haystack = " ".join([title, copy["description"], episode["scenario"], " ".join(episode["dialogue"])]).lower()
    flagged = [term for term in REVIEW_TERMS if term in haystack]

    checks = [
        check("title_length", 10 <= len(title) <= limits["title_max_chars"],
              f"{len(title)} chars (max {limits['title_max_chars']})", 2, True),
        check("title_unique", title.lower() not in {t.lower() for t in existing_titles},
              "title already used in this batch or channel history", 2, True),
        check("hook_text_short", len(words(copy["hook_text"])) <= 6,
              f"{len(words(copy['hook_text']))} words (max 6)", 1),
        check("opening_line_is_quick", first_line_words <= 12,
              f"first spoken line is {first_line_words} words; viewers decide in ~2s", 2),
        check("dialogue_fits_clip", dialogue_words <= speakable,
              f"{dialogue_words} words vs ~{speakable} that fit in {seconds}s", 3, True),
        check("character_block_verbatim", channel["series"]["character"]["block"] in prompt,
              "character block must appear word-for-word in the Veo prompt", 3, True),
        check("shorts_tag", "#Shorts" in yt["description"], "#Shorts missing from description", 2),
        check("hashtag_count", channel["limits"]["youtube_hashtags"][0] <= len(yt["tags"]) <= channel["limits"]["youtube_hashtags"][1],
              f"{len(yt['tags'])} hashtags", 1),
        check("cta_present", channel["series"]["cta"].split(".")[0].lower()[:12] in copy["description"].lower(),
              "description lacks the follow CTA", 1),
        check("ai_disclosure_set", packs["youtube"]["containsSyntheticMedia"] == channel["disclosure"]["ai_generated"]
              and packs["tiktok"]["ai_generated_content_label"] and packs["instagram"]["ai_label"],
              "AI labels must be on for YouTube, TikTok and Instagram", 3, True),
        check("no_review_terms", not flagged,
              f"needs a human look: {', '.join(flagged)}" if flagged else "ok", 3, True),
    ]
    total = sum(c["weight"] for c in checks)
    earned = sum(c["weight"] for c in checks if c["ok"])
    blockers = [c["name"] for c in checks if c["blocking"] and not c["ok"]]
    return {
        "score": round(100 * earned / total),
        "ready": not blockers,
        "blockers": blockers,
        "checks": checks,
    }
