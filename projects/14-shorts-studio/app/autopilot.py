"""One content cycle: trends -> ideas -> plan -> (render) -> captions -> review queue.

Everything that spends money (--execute) or reaches the public (publish) is
gated. Nothing is ever auto-approved: a person approves each episode.
"""
import json
import os
from datetime import date
from pathlib import Path

from . import trends
from .config import ROOT, load_channel
from .copywriter import get_copywriter
from .ideas import bank_ideas, generate_ideas
from .media import finish_episode
from .pipeline import plan_episode, write_episode
from .shots import total_seconds
from .schedule import build_schedule
from .state import State, StateError, estimate_cost
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


def info_shots(info):
    """Shots recorded for an episode; older episodes were a single shot with their dialogue at the top level."""
    return info.get("shots") or [{"dialogue": info.get("dialogue", []), "seconds": info.get("seconds", 8)}]


def finish_clip(state, out, ep_id, channel, log=print):
    """Raw clips exist -> trim, caption, join -> review queue. Safe to repeat (reprocess)."""
    info = state.data["episodes"][ep_id]
    finish_episode(Path(out) / ep_id, info_shots(info), tuple(channel["limits"]["output_size"]), log)
    order = ["planned", "rendered", "captioned", "pending_review"]
    if info["status"] in order[:-1]:  # advance from wherever it is; later statuses (approved...) are left alone
        for status in order[order.index(info["status"]) + 1:]:
            state.set_status(ep_id, status)
    log(f"  finished {ep_id} -> {info['status']}")


def has_all_raw(out, ep_id, info):
    from .media import raw_clip_path
    shots = info_shots(info)
    return all(raw_clip_path(Path(out) / ep_id, n, len(shots)).exists() for n in range(1, len(shots) + 1))


def ingest_manual_clips(state, out, channel, log=print):
    """Clips you rendered by hand in Flow: save them as out/<id>/raw_1.mp4 (raw.mp4 for a one-shot episode)."""
    count = 0
    for ep_id in state.with_status("planned"):
        if has_all_raw(out, ep_id, state.data["episodes"][ep_id]):
            state.set_status(ep_id, "rendered", "manual")
            finish_clip(state, out, ep_id, channel, log)
            count += 1
    return count


def reprocess(out, ep_id, channel, log=print):
    """Redo trimming, captions and stitching from the clips already rendered. Costs nothing."""
    state = State(Path(out) / "state.json")
    if ep_id not in state.data["episodes"]:
        raise StateError(f"Unknown episode {ep_id}")
    finish_clip(state, out, ep_id, channel, log)
    state.save()


# Lint checks that decide whether the VIDEO is worth paying for (metadata-only flags, like the CTA, don't).
RENDER_CHECKS = {"scene_has_no_on_screen_text", "character_pronoun_matches", "dialogue_fits_clip",
                 "character_block_verbatim", "no_review_terms", "opening_line_is_quick",
                 "mouth_visible", "shots_have_camera_facing"}


def pick_renderable(state, out, only=None, log=print):
    """Planned episodes worth paying to render. Rejects unsafe topics; skips episodes whose lint has any failure."""
    chosen = []
    for ep_id in state.with_status("planned"):
        if only and ep_id != only:
            continue
        info = state.data["episodes"][ep_id]
        if not trends.is_safe(info.get("topic", "")):
            state.set_status(ep_id, "rejected", "unsafe topic")
            log(f"  rejected {ep_id}: topic is not safe to joke about")
            continue
        report_path = Path(out) / ep_id / "report.json"
        failed = []
        if report_path.exists():
            failed = [c["name"] for c in json.loads(report_path.read_text())["checks"]
                      if not c["ok"] and c["name"] in RENDER_CHECKS]
        if failed:
            log(f"  skipped  {ep_id}: lint flags {failed}; not worth paying to render")
            continue
        chosen.append(ep_id)
    return chosen


def run_cycle(out, channel_path=None, count=3, ideas="mock", copywriter="mock",
              live_trends=False, execute=False, max_clips=3, provider="veo", only=None, renderer=None, log=print):
    channel = load_channel(channel_path)
    out = Path(out)
    state = State(out / "state.json")
    ingest_manual_clips(state, out, channel, log)

    if ideas == "bank":
        episodes = bank_ideas(ROOT / "ideas" / "ideas_bank.jsonl", count, set(state.data["episodes"]),
                              state.next_number(), channel)
    else:
        topics = gather_topics(channel, state, count, live_trends, log)
        episodes = generate_ideas(channel, topics, state.next_number(), ideas) if topics else []
    if episodes:
        batch = ROOT / "prompts" / "generated"
        batch.mkdir(parents=True, exist_ok=True)
        (batch / f"{date.today():%Y%m%d}.jsonl").write_text("".join(json.dumps(e, ensure_ascii=False) + "\n" for e in episodes))
        writer = get_copywriter(copywriter)
        for episode in episodes:
            plan = plan_episode(channel, episode, writer, state.used_titles())
            write_episode(out, channel, episode, plan)
            ready = plan["report"]["ready"]
            state.ensure(episode["id"], title=plan["copy"]["title"], episode=episode["episode"],
                         score=plan["report"]["score"], dialogue=episode["dialogue"], shots=episode["shots"],
                         seconds=total_seconds(episode),
                         **({"topic": episode.get("topic", "")} if ready else {}))
            if ready:
                log(f"  planned  {episode['id']}  \"{plan['copy']['title']}\"  ({total_seconds(episode)}s, {len(episode['shots'])} shots)")
            else:
                state.set_status(episode["id"], "rejected", "lint: " + ",".join(plan["report"]["blockers"]))
                log(f"  BLOCKED  {episode['id']}: {plan['report']['blockers']}")
    else:
        log("No new safe episodes to plan.")

    try:
        _render_or_report(state, out, channel, execute, max_clips, provider, only, log, renderer)
    finally:
        state.save()
    return state


def prompt_for_shot(folder, number):
    path = Path(folder) / f"prompt_{number}.txt"
    if path.exists():
        return path.read_text()
    return (Path(folder) / "prompt.txt").read_text()  # episodes planned before multi-shot support


def _render_or_report(state, out, channel, execute, max_clips, provider, only, log, renderer=None):
    pending = pick_renderable(state, out, only, log)
    if pending and not execute:
        log(f"\n{len(pending)} planned. Render each shot's prompt_N.txt in Flow, save as out/<id>/raw_N.mp4, then run "
            "autopilot again (or `ingest`). Or add --execute to render with Veo (spends money).")
        return
    if not pending:
        return
    from .media import raw_clip_path
    renderer = renderer or get_video_provider(provider, channel)
    price, budget = channel["veo"]["price_per_second_usd"], channel["veo"]["max_budget_usd_per_run"]
    monthly = channel["veo"].get("max_budget_usd_per_month")
    spent, clips_left = 0.0, max_clips
    for ep_id in pending:
        info = state.data["episodes"][ep_id]
        folder = out / ep_id
        shots = info_shots(info)
        todo = [(n, s) for n, s in enumerate(shots, 1) if not raw_clip_path(folder, n, len(shots)).exists()]
        if todo:
            cost = sum(estimate_cost(s["seconds"], price) for _, s in todo)
            if len(todo) > clips_left:
                log(f"  {ep_id} needs {len(todo)} clips but only {clips_left} are allowed this run; not starting it.")
                continue  # never half-render an episode
            if spent + cost > budget:
                log(f"  budget: ${spent + cost:.2f} would exceed ${budget:.2f}/run; not starting {ep_id}.")
                continue
            if monthly is not None and state.month_spend() + cost > monthly:
                log(f"  budget: ${state.month_spend() + cost:.2f} would exceed the ${monthly:.2f}/month cap; stopping renders.")
                break
            for n, shot in todo:
                renderer.generate(folder, prompt_for_shot(folder, n), shot["seconds"], f"raw_{n}.mp4")
                shot_cost = estimate_cost(shot["seconds"], price)
                spent += shot_cost
                clips_left -= 1
                state.add_spend(shot_cost)
                state.save()  # persist after every paid clip so a later failure cannot lose track of spend
                log(f"  rendered {ep_id} shot {n}/{len(shots)} (est. ${shot_cost})")
        state.set_status(ep_id, "rendered", f"~${sum(estimate_cost(s['seconds'], price) for s in shots)}")
        finish_clip(state, out, ep_id, channel, log)
        state.save()
        if clips_left <= 0:
            break


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
