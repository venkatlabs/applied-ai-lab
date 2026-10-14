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
from app import trends
from app.captions import cues_from_speech
from app.ideas import mock_ideas
from app.state import State, StateError, estimate_cost
import tempfile

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

    rss = ('<rss xmlns:ht="https://trends.google.com/trending/rss"><channel>'
           '<item><title>pumpkin spice latte</title><ht:approx_traffic>200,000+</ht:approx_traffic></item>'
           '<item><title>earthquake hits city</title><ht:approx_traffic>500,000+</ht:approx_traffic></item>'
           '<item><title>trump rally</title><ht:approx_traffic>900,000+</ht:approx_traffic></item>'
           '</channel></rss>')
    parsed = trends.google_trends(fetch=lambda url: rss)
    case("google trends rss parses topics and traffic", len(parsed) == 3 and parsed[0]["score"] == 200000, parsed)
    kept = trends.collect([parsed], limit=10)
    case("tragedy and politics topics are filtered out", [t["topic"] for t in kept] == ["pumpkin spice latte"], kept)
    yt = trends.youtube_popular("k", fetch=lambda url: '{"items":[{"snippet":{"title":"Cat video"}}]}')
    case("youtube popular parses titles", yt[0]["topic"] == "Cat video")
    seed = [{"topic": "Reply-all email chain", "source": "seed", "score": 1}]
    case("used topics are not reused", trends.collect([seed], used=["reply-all email chain"]) == [])

    topics = [{"topic": "Monday morning standup", "source": "seed", "score": 1},
              {"topic": "Open office noise", "source": "seed", "score": 1}]
    batch, titles, ok_count = mock_ideas(topics, 7), [], 0
    for episode in batch:
        result = plan_episode(channel, episode, MockCopywriter(), titles)
        titles.append(result["copy"]["title"])
        ok_count += result["report"]["ready"]
    case("generated ideas pass the lint with distinct titles", ok_count == 2 and len(set(titles)) == 2, titles)

    with tempfile.TemporaryDirectory() as tmp:
        state = State(tmp + "/state.json")
        state.ensure("a")
        try:
            state.set_status("a", "approved")
            case("cannot approve an unreviewed episode", False)
        except StateError:
            case("cannot approve an unreviewed episode", True)
        state.set_status("a", "pending_review")
        state.set_status("a", "approved")
        state.save()
        case("state persists across loads", State(tmp + "/state.json").with_status("approved") == ["a"])
    try:
        estimate_cost(8, None)
        case("rendering is refused until a price is configured", False)
    except StateError:
        case("rendering is refused until a price is configured", True)
    case("cost estimate is seconds x price", estimate_cost(8, 0.5) == 4.0)

    two = cues_from_speech(["Per my last email: I need a nap."], [(1.4, 2.6), (4.1, 6.2)])
    case("caption phrases map onto speech bursts", [c[2] for c in two] == ["Per my last email:", "I need a nap."], two)

    noisy = cues_from_speech(["go now"], [(0, .3), (.5, .8), (1, 1.3), (1.5, 1.8)])
    case("extra speech bursts never duplicate or drop words", " ".join(c[2] for c in noisy) == "go now", noisy)

    from app import autopilot
    from app.pipeline import episode_seconds
    case("per-episode duration is kept (6s stays 6s)", episode_seconds(channel, {"clip_seconds": 6}) == 6)
    uploads = []
    with tempfile.TemporaryDirectory() as tmp:
        for ep_id in ("a", "b"):
            (Path(tmp) / ep_id).mkdir()
            (Path(tmp) / ep_id / "youtube.json").write_text(json.dumps({"title": ep_id}))
        st = State(tmp + "/state.json")
        for ep_id in ("a", "b"):
            st.ensure(ep_id); st.set_status(ep_id, "pending_review"); st.set_status(ep_id, "approved")
        st.save()

        def flaky(folder, pack, publish_at):
            if pack["title"] == "b":
                raise RuntimeError("network down")
            uploads.append(pack["title"])
            return "vid-" + pack["title"]
        try:
            autopilot.publish_approved(tmp, flaky, True, log=lambda *_: None)
        except RuntimeError:
            pass
        after = State(tmp + "/state.json")
        case("successful upload is persisted before a later one fails",
             after.with_status("published") == ["a"] and after.with_status("approved") == ["b"])
        autopilot.publish_approved(tmp, lambda f, p, t: "vid-" + p["title"], True, log=lambda *_: None)
        case("retry does not re-upload the first video", uploads == ["a"])

    with tempfile.TemporaryDirectory() as tmp:
        sp = State(tmp + "/s.json")
        sp.add_spend(1.2); sp.add_spend(0.8)
        case("monthly spend accumulates for the cap check", sp.month_spend() == 2.0 and sp.data["spend_usd"] == 2.0)
    case("monthly cap is configured", channel["veo"]["max_budget_usd_per_month"] > 0)

    import io
    import os
    import urllib.error
    import urllib.request
    from app import anthropic_api as api
    good = "sk-ant-api03-" + "x" * 60
    case("pasted key is cleaned (newline, spaces, quotes)", api.clean_key(f'  "{good}"\n') == good)
    case("valid-looking key has no problem", api.key_problem(good) is None)
    case("wrong-prefix key is flagged", "sk-ant-" in api.key_problem("AIzaSy" + "x" * 40))
    case("empty key is flagged", "not set" in api.key_problem(""))
    original = urllib.request.urlopen
    def reject(request, timeout=0):
        raise urllib.error.HTTPError(request.full_url, 401, "Unauthorized", {},
                                     io.BytesIO(b'{"error":{"message":"invalid x-api-key"}}'))
    urllib.request.urlopen = reject
    os.environ["ANTHROPIC_API_KEY"] = "bad-key"
    try:
        try:
            api.post_messages({})
            msg = ""
        except api.AnthropicError as error:
            msg = str(error)
    finally:
        urllib.request.urlopen = original
        del os.environ["ANTHROPIC_API_KEY"]
    case("401 gives an actionable message without leaking the key",
         "rejected the key" in msg and "invalid x-api-key" in msg and "bad-key" not in msg, msg)

    fenced = 'Sure! ```json\n{"title": "a", "n": {"x": 1}}\n``` hope that helps {not json}'
    case("JSON is found inside fences and prose", api.extract_json(fenced, "object") == {"title": "a", "n": {"x": 1}})
    case("array is found among prose", api.extract_json("Here: [1, 2] done", "array") == [1, 2])
    case("no JSON gives None", api.extract_json("I cannot help with that.", "object") is None)
    replies = iter(["I'd be happy to help!", '{"title": "ok"}'])
    original_post = api.post_messages
    api.post_messages = lambda body, timeout=60: {"content": [{"type": "text", "text": next(replies)}], "stop_reason": "end_turn"}
    try:
        parsed, _ = api.complete_json({}, "object")
        case("a bad reply is retried once and recovers", parsed == {"title": "ok"})
        api.post_messages = lambda body, timeout=60: {"content": [{"type": "text", "text": "No."}], "stop_reason": "refusal"}
        try:
            api.complete_json({}, "object")
            msg2 = ""
        except api.AnthropicError as error:
            msg2 = str(error)
        case("persistent bad replies fail loudly with context", "refusal" in msg2 and "No." in msg2, msg2)
    finally:
        api.post_messages = original_post
    bad_scene = plan(channel, scenario="She presses a key and the screen flashes 'Reply All: Unsubscribed'.")
    flagged = {c["name"] for c in bad_scene["report"]["checks"] if not c["ok"]}
    case("scene with on-screen text and wrong pronoun is flagged",
         {"scene_has_no_on_screen_text", "character_pronoun_matches"} <= flagged, flagged)

    from app.copywriter import AnthropicCopywriter
    from app.ideas import generate_ideas
    ideas_reply = json.dumps([{"scenario": "Bubbles stares down a printer that jammed.", "dialogue": ["Per my last jam."],
                               "hook_text": "Printer says no", "topic_tags": ["#Printers"]}])
    copy_reply = json.dumps({"title": "Printer jam, again 🖨️", "hook_text": "Printer says no",
                             "description": "Printer says no.\nBubbles.", "topic_tags": ["#Printers"]})
    os.environ["ANTHROPIC_API_KEY"] = "sk-ant-" + "x" * 60
    original_post = api.post_messages
    try:
        api.post_messages = lambda body, timeout=60: {"content": [{"type": "text", "text": "Here you go:\n" + ideas_reply}],
                                                       "stop_reason": "end_turn", "usage": {}}
        generated = generate_ideas(channel, [{"topic": "Printer jam", "source": "seed", "score": 1}], 9, "anthropic")
        case("anthropic idea path returns the model's ideas, not templates",
             len(generated) == 1 and generated[0]["dialogue"] == ["Per my last jam."] and generated[0]["episode"] == 9, generated)
        api.post_messages = lambda body, timeout=60: {"content": [{"type": "text", "text": copy_reply}],
                                                       "stop_reason": "end_turn", "usage": {"input_tokens": 1}}
        written = AnthropicCopywriter().write(channel, generated[0])
        case("anthropic copywriter path returns the model's copy", written["title"] == "Printer jam, again 🖨️", written)
    finally:
        api.post_messages = original_post
        del os.environ["ANTHROPIC_API_KEY"]

    seen = []
    def spy(body, timeout=60):
        seen.append(body)
        if len(seen) == 1:
            return {"content": [], "stop_reason": "max_tokens"}  # thinking used the whole budget
        return {"content": [{"type": "text", "text": '{"title": "ok"}'}], "stop_reason": "end_turn"}
    api.post_messages = spy
    try:
        out, _ = api.complete_json({"max_tokens": 1000}, "object")
    finally:
        api.post_messages = original_post
    case("out-of-tokens reply is retried with a doubled budget",
         out == {"title": "ok"} and [b["max_tokens"] for b in seen] == [1000, 2000], [b["max_tokens"] for b in seen])
    bodies = []
    api.post_messages = lambda body, timeout=60: (bodies.append(body), {"content": [{"type": "text", "text": ideas_reply}], "stop_reason": "end_turn"})[1]
    os.environ["ANTHROPIC_API_KEY"] = "sk-ant-" + "x" * 60
    try:
        generate_ideas(channel, [{"topic": "Printer jam", "source": "seed", "score": 1}], 1, "anthropic")
        api.post_messages = lambda body, timeout=60: (bodies.append(body), {"content": [{"type": "text", "text": copy_reply}], "stop_reason": "end_turn"})[1]
        AnthropicCopywriter().write(channel, {"scenario": "s", "dialogue": ["d"], "hook_text": "h"})
    finally:
        api.post_messages = original_post
        del os.environ["ANTHROPIC_API_KEY"]
    case("model calls use low effort and a roomy token budget",
         all(b["output_config"] == {"effort": "low"} for b in bodies) and bodies[0]["max_tokens"] >= 1500 and bodies[1]["max_tokens"] >= 4096,
         [(b["max_tokens"], b.get("output_config")) for b in bodies])

    case("tornado/weather disaster topics are filtered", not any(trends.is_safe(t) for t in
         ["kansas city weather tornado", "hurricane warning", "wildfire evacuation", "flash flood"]))
    case("office topics still pass the filter", all(trends.is_safe(t) for t in ["Monday morning standup", "Reply-all email chain"]))
    sensitive = json.dumps([None, {"scenario": "Bubbles sighs.", "dialogue": ["Fine."], "hook_text": "Fine", "topic_tags": []}])
    api.post_messages = lambda body, timeout=60: {"content": [{"type": "text", "text": sensitive}], "stop_reason": "end_turn"}
    os.environ["ANTHROPIC_API_KEY"] = "sk-ant-" + "x" * 60
    try:
        kept = generate_ideas(channel, [{"topic": "Sad news", "source": "t", "score": 1}, {"topic": "Printer jam", "source": "t", "score": 1}], 1, "anthropic")
    finally:
        api.post_messages = original_post
        del os.environ["ANTHROPIC_API_KEY"]
    case("a topic the model declines (null) is skipped, not crashed on", len(kept) == 1 and kept[0]["dialogue"] == ["Fine."], kept)
    nocta = plan(channel, title="Printer jam, again 🖨️")
    copy2 = dict(nocta["copy"]); copy2["description"] = "Just a line with no call to action."
    from app.platforms import build_packs
    case("follow CTA is appended when the model forgets it",
         channel["series"]["cta"] in build_packs(channel, {**BASE}, copy2)["youtube"]["description"])
    with tempfile.TemporaryDirectory() as tmp:
        stx = State(tmp + "/s.json")
        for ep_id, topic, failed in (("clean", "Open office noise", None), ("flawed", "Printer jam", "scene_has_no_on_screen_text"),
                                     ("tornado", "kansas city weather tornado", None)):
            stx.ensure(ep_id, topic=topic)
            (Path(tmp) / ep_id).mkdir()
            checks = [{"name": failed or "ok", "ok": failed is None}]
            (Path(tmp) / ep_id / "report.json").write_text(json.dumps({"checks": checks}))
        picked = autopilot.pick_renderable(stx, tmp, log=lambda *_: None)
        case("render gate keeps only clean, safe episodes", picked == ["clean"] and stx.with_status("rejected") == ["tornado"], picked)
        stx.ensure("other", topic="Reply-all email chain"); (Path(tmp) / "other").mkdir()
        with tempfile.TemporaryDirectory() as tmp2:
        st2 = State(tmp2 + "/s.json"); st2.ensure("meta", topic="Open office noise"); (Path(tmp2) / "meta").mkdir()
        (Path(tmp2) / "meta" / "report.json").write_text(json.dumps({"checks": [{"name": "cta_present", "ok": False}]}))
        case("a metadata-only lint flag does not block rendering",
             autopilot.pick_renderable(st2, tmp2, log=lambda *_: None) == ["meta"])
    case("--only selects one episode", autopilot.pick_renderable(stx, tmp, only="clean", log=lambda *_: None) == ["clean"])

    for name, passed, detail in results:
        print(f"{'PASS' if passed else 'FAIL'} {name}")
        if not passed and detail:
            print(f"  {detail}")
    passed_count = sum(1 for _, passed, _ in results if passed)
    print(f"\n{passed_count}/{len(results)} evals passed")
    raise SystemExit(0 if passed_count == len(results) else 1)


if __name__ == "__main__":
    main()
