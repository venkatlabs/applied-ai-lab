"""Publish-readiness lint.

This is NOT a view predictor. Nobody can predict virality offline. It checks
the rules we know are cheap to satisfy (length, hook placement, tags,
duplication, lip-sync-friendly shots, policy flags) so weak episodes are
caught before they cost a render. Reach itself is measured after publishing
(see docs/VIRAL_PLAYBOOK.md and docs/RESEARCH_2026-10.md).
"""
import re

REVIEW_TERMS = (
    "disney", "pixar", "marvel", "nintendo", "pokemon", "trump", "biden", "musk",
    "taylor swift", "kardashian", "cure", "guaranteed income", "get rich",
)
# Things that hide the mouth or face from the lens: bad for a shot where Bubbles must lip-sync.
OCCLUSION = re.compile(
    r"covers? (?:his|the) (?:face|mouth|ears?)|hands? (?:over|on|covering) (?:his|the) (?:face|mouth)|"
    r"turns? his (?:back|head) (?:away|to)|his back (?:to|toward) (?:the )?camera|faces? away|face ?down|\b(?:he|bubbles) hides?\b",
    re.I,
)
# A quoted phrase (not an apostrophe inside a word) means the scene asks for on-screen text.
QUOTED_TEXT = re.compile(r"(?<![A-Za-z0-9])['\"“‘][^'\"”’]{3,}['\"”’](?![A-Za-z0-9])")


def words(text):
    return re.findall(r"[\w'’-]+", text)


def check(name, ok, detail, weight=1, blocking=False):
    return {"name": name, "ok": bool(ok), "detail": detail, "weight": weight, "blocking": blocking}


def shot_overruns(channel, episode):
    """(shot number, words, limit) for every shot whose dialogue cannot be said in its length."""
    limits = channel["limits"]
    bad = []
    for number, shot in enumerate(episode["shots"], 1):
        rate = limits.get("spoken_words_per_second", limits["words_per_second"]) if shot["delivery"] == "spoken" \
            else limits["words_per_second"]
        count = sum(len(words(line)) for line in shot["dialogue"])
        limit = int(shot["seconds"] * rate)
        if count > limit:
            bad.append((number, count, limit))
    return bad


def lint_episode(channel, episode, copy, packs, prompt, existing_titles=()):
    limits = channel["limits"]
    prompts = [prompt] if isinstance(prompt, str) else list(prompt)
    shots = episode["shots"]
    total = sum(s["seconds"] for s in shots)
    yt = packs["youtube"]
    first_line = episode["dialogue"][0] if episode["dialogue"] else ""
    title = copy["title"]
    scenario = episode["scenario"]
    haystack = " ".join([title, copy["description"], scenario, " ".join(episode["dialogue"])]).lower()
    flagged = [term for term in REVIEW_TERMS if term in haystack]
    overruns = shot_overruns(channel, episode)
    spoken = [(n, s) for n, s in enumerate(shots, 1) if s["delivery"] == "spoken" and s["dialogue"]]
    no_camera = [n for n, s in spoken if "camera" not in s["scenario"].lower()]
    covered = [n for n, s in spoken if OCCLUSION.search(s["scenario"])]
    minimum = limits.get("episode_seconds_target_min", 15)

    checks = [
        check("title_length", 10 <= len(title) <= limits["title_max_chars"],
              f"{len(title)} chars (max {limits['title_max_chars']})", 2, True),
        check("title_unique", title.lower() not in {t.lower() for t in existing_titles},
              "title already used in this batch or channel history", 2, True),
        check("hook_text_short", len(words(copy["hook_text"])) <= 6,
              f"{len(words(copy['hook_text']))} words (max 6)", 1),
        check("opening_line_is_quick", len(words(first_line)) <= 12,
              f"first line is {len(words(first_line))} words; viewers decide in ~2s", 2),
        check("dialogue_fits_clip", not overruns,
              "; ".join(f"shot {n}: {c} words, room for {lim}" for n, c, lim in overruns) or "ok", 3, True),
        check("character_block_verbatim", all(channel["series"]["character"]["block"] in p for p in prompts),
              "character block must appear word-for-word in every shot's Veo prompt", 3, True),
        check("shots_have_camera_facing", not no_camera,
              f"spoken shots {no_camera} never say Bubbles looks into the camera (lip-sync needs a face to lens)", 2),
        check("mouth_visible", not covered,
              f"spoken shots {covered} hide his face or mouth; use a voiceover shot instead", 2),
        check("episode_length", total >= minimum, f"{total}s total; target {minimum}s or more", 1),
        check("shorts_tag", "#Shorts" in yt["description"], "#Shorts missing from description", 2),
        check("hashtag_count", limits["youtube_hashtags"][0] <= len(yt["tags"]) <= limits["youtube_hashtags"][1],
              f"{len(yt['tags'])} hashtags", 1),
        check("cta_present", channel["series"]["cta"].split(".")[0].lower()[:12] in yt["description"].lower(),
              "description lacks the follow CTA", 1),
        check("ai_disclosure_set", packs["youtube"]["containsSyntheticMedia"] == channel["disclosure"]["ai_generated"]
              and packs["tiktok"]["ai_generated_content_label"] and packs["instagram"]["ai_label"],
              "AI labels must be on for YouTube, TikTok and Instagram", 3, True),
        check("scene_has_no_on_screen_text", not QUOTED_TEXT.search(scenario),
              "scene quotes on-screen text; Veo is told to render none, so drop it", 1),
        check("character_pronoun_matches", not re.search(r"\b(she|her|hers)\b", scenario, re.I),
              "Bubbles is a boy; scene uses she/her", 1),
        check("no_review_terms", not flagged,
              f"needs a human look: {', '.join(flagged)}" if flagged else "ok", 3, True),
    ]
    total_weight = sum(c["weight"] for c in checks)
    earned = sum(c["weight"] for c in checks if c["ok"])
    blockers = [c["name"] for c in checks if c["blocking"] and not c["ok"]]
    return {
        "score": round(100 * earned / total_weight),
        "ready": not blockers,
        "blockers": blockers,
        "checks": checks,
    }
