"""One content cycle: trends -> ideas -> plan -> (render) -> captions -> review queue.

Everything that spends money (--execute) or reaches the public (publish) is
gated. Nothing is ever auto-approved: a person approves each episode.
"""
import json
import os
from datetime import date
from pathlib import Path

from . import trends
from .captions import burn, cues_from_speech, speech_bursts, to_ass, to_srt
from .config import ROOT, load_channel
from .copywriter import get_copywriter
from .ideas import generate_ideas
from .pipeline import plan_episode, write_episode
from .schedule import build_schedule
from .state import State, estimate_cost
from .video_providers import get_video_provider


def gather_topics(channel, state, count, live, log=print):
    sources = [trends.seed_topics(ROOT / channel["trends"]["seed_file"])]
    if live:
        geo = channel["trends"]["geo"]
        for name, getter in (
            ("google_trends", lambda: trends.google_trends(geo)),
            ("youtube_popular", lambda: trends.youtube_popular(os.environ["YOUTUBE_API_KEY"], geo)),
        ):
            try:
                if name == "youtube_popular" and not os.getenv("YOUTUBE_API_KEY"):
                    continue
                sources.append(getter())
            except Exception as error:  # a dead source must not stop the cycle
                log(f"  trend source {name} failed: {error}")
    return trends.collect(sources, limit=count, used=state.used_topics())


def caption_episode(folder, dialogue):
    folder = Path(folder)
    bursts = speech_bursts(folder / "raw.mp4")
    cues = cues_from_speech(dialogue, bursts)
    if cues:
        (folder / "captions.srt").write_text(to_srt(cues))
        (folder / "captions.ass").write_text(to_ass(cues))
    return burn(folder)


def finish_clip(state, out, ep_id, log=print):
    """raw.mp4 exists -> captions -> review queue."""
    info = state.data["episodes"][ep_id]
    folder = Path(out) / ep_id
    caption_episode(folder, info["dialogue"])
    for status in ("rendered", "captioned", "pending_review"):
        if state.data["episodes"][ep_id]["status"] != status:
            state.set_status(ep_id, status)
    log(f"  captioned {ep_id} -> pending_review")


def ingest_manual_clips(state, out, log=print):
    """Clips you rendered by hand in Flow: drop raw.mp4 into the folder, then run this."""
    count = 0
    for ep_id in state.with_status("planned"):
        if (Path(out) / ep_id / "raw.mp4").exists():
            state.set_status(ep_id, "rendered", "manual")
            finish_clip(state, out, ep_id, log)
            count += 1
    return count


def run_cycle(out, channel_path=None, count=3, ideas="mock", copywriter="mock",
              live_trends=False, execute=False, max_clips=1, provider="veo", log=print):
    channel = load_channel(channel_path)
    out = Path(out)
    state = State(out / "state.json")
    ingest_manual_clips(state, out, log)

    topics = gather_topics(channel, state, count, live_trends, log)
    if topics:
        episodes = generate_ideas(channel, topics, state.next_number(), ideas)
        batch = ROOT / "prompts" / "generated"
        batch.mkdir(parents=True, exist_ok=True)
        (batch / f"{date.today():%Y%m%d}.jsonl").write_text("".join(json.dumps(e, ensure_ascii=False) + "\n" for e in episodes))
        writer = get_copywriter(copywriter)
        for topic, episode in zip(topics, episodes):
            plan = plan_episode(channel, episode, writer, state.used_titles())
            write_episode(out, channel, episode, plan)
            ready = plan["report"]["ready"]
            state.ensure(episode["id"], title=plan["copy"]["title"], episode=episode["episode"],
                         score=plan["report"]["score"], dialogue=episode["dialogue"],
                         seconds=min(int(episode.get("clip_seconds", 8)), channel["limits"]["clip_seconds_max"]),
                         **({"topic": topic["topic"]} if ready else {}))
            if ready:
                log(f"  planned  {episode['id']}  \"{plan['copy']['title']}\"")
            else:
                state.set_status(episode["id"], "rejected", "lint: " + ",".join(plan["report"]["blockers"]))
                log(f"  BLOCKED  {episode['id']}: {plan['report']['blockers']}")
    else:
        log("No new safe topics found.")

    try:
        _render_or_report(state, out, channel, execute, max_clips, provider, log)
    finally:
        state.save()
    return state


def _render_or_report(state, out, channel, execute, max_clips, provider, log):
    pending = state.with_status("planned")
    if pending and not execute:
        log(f"\n{len(pending)} planned. Render each prompt.txt in Flow, save as out/<id>/raw.mp4, then run autopilot again "
            "(or `ingest`). Or add --execute to render with Veo (spends money).")
    elif pending:
        renderer = get_video_provider(provider, channel)
        price, budget = channel["veo"]["price_per_second_usd"], channel["veo"]["max_budget_usd_per_run"]
        spent = 0.0
        for ep_id in pending[:max_clips]:
            info = state.data["episodes"][ep_id]
            cost = estimate_cost(info["seconds"], price)
            if spent + cost > budget:
                log(f"  budget: ${spent + cost:.2f} would exceed ${budget:.2f}/run; stopping renders.")
                break
            monthly = channel["veo"].get("max_budget_usd_per_month")
            if monthly is not None and state.month_spend() + cost > monthly:
                log(f"  budget: ${state.month_spend() + cost:.2f} would exceed the ${monthly:.2f}/month cap; stopping renders.")
                break
            folder = out / ep_id
            renderer.generate(folder, (folder / "prompt.txt").read_text(), info["seconds"])
            spent += cost
            state.add_spend(cost)
            state.set_status(ep_id, "rendered", f"~${cost}")
            finish_clip(state, out, ep_id, log)


def review_queue(out):
    state = State(Path(out) / "state.json")
    return [(i, state.data["episodes"][i]) for i in state.with_status("pending_review")]


def decide(out, ids, approve, note=""):
    state = State(Path(out) / "state.json")
    for ep_id in ids:
        state.set_status(ep_id, "approved" if approve else "rejected", note)
    state.save()


def publish_approved(out, upload, execute, channel_path=None, log=print):
    from .config import load_channel as _lc
    channel = _lc(channel_path)
    out = Path(out)
    state = State(out / "state.json")
    ids = state.with_status("approved")
    if not ids:
        log("Nothing approved.")
        return
    published = [e["publishAt"] for e in state.data["episodes"].values() if e.get("publishAt")]
    start = None
    if published:
        from datetime import datetime, timedelta
        start = (datetime.fromisoformat(max(published).replace("Z", "+00:00")).date() + timedelta(days=1)).isoformat()
    slots = build_schedule(channel, ids, start)
    for slot in slots:
        folder = out / slot["id"]
        pack = json.loads((folder / "youtube.json").read_text())
        if not execute:
            log(f"[dry-run] {slot['id']}: private, goes public {slot['local']} — {pack['title']}")
            continue
        video_id = upload(folder, pack, slot["publishAt"])
        state.ensure(slot["id"], publishAt=slot["publishAt"], youtube_id=video_id)
        state.set_status(slot["id"], "published", f"https://youtu.be/{video_id}")
        state.save()  # persist now: a later failure must not make a retry re-upload this one
        log(f"uploaded {slot['id']} -> https://youtu.be/{video_id}")


def markdown_report(out, repo=None):
    state = State(Path(out) / "state.json")
    base = f"https://github.com/{repo}/blob/studio-data" if repo else None
    lines = ["# Shorts Studio", "", f"Estimated render spend to date: **${state.data['spend_usd']:.2f}**", "",
             "| # | Status | Title | Score | Files |", "|---|---|---|---|---|"]
    for ep_id, info in sorted(state.data["episodes"].items(), key=lambda kv: kv[1].get("episode", 0)):
        if not base:
            files = ep_id
        elif info["status"] == "planned":
            files = f"[prompt]({base}/{ep_id}/prompt.txt)"
        else:
            files = f"[video]({base}/{ep_id}/final.mp4) · [prompt]({base}/{ep_id}/prompt.txt)"
        lines.append(f"| {info.get('episode', '')} | {info['status']} | {info.get('title', '')} | {info.get('score', '')} | {files} |")
    waiting = state.with_status("planned")
    if waiting:
        lines += ["", f"**{len(waiting)} planned episode(s) have no video yet.** Render each `prompt.txt` in Flow, "
                  "save it as `raw.mp4` in that episode's folder, or re-run with execute on."]
    return "\n".join(lines)
