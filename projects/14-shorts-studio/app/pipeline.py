import json
from pathlib import Path

from .captions import write_caption_files
from .config import load_channel, load_episodes
from .copywriter import get_copywriter
from .platforms import build_packs
from .schedule import build_schedule
from .scoring import lint_episode
from .veo_prompt import build_veo_prompt


def write_json(path, data):
    Path(path).write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def plan_episode(channel, episode, copywriter, used_titles):
    copy = copywriter.write(channel, episode)
    copy["topic_tags"] = copy.get("topic_tags") or episode.get("topic_tags", [])
    prompt = build_veo_prompt(channel, episode)
    packs = build_packs(channel, episode, copy)
    report = lint_episode(channel, episode, copy, packs, prompt, used_titles)
    return {"copy": copy, "prompt": prompt, "packs": packs, "report": report}


def episode_seconds(channel, episode):
    return min(int(episode.get("clip_seconds", channel["limits"]["clip_seconds_max"])),
               channel["limits"]["clip_seconds_max"])


def write_episode(out, channel, episode, plan):
    folder = Path(out) / episode["id"]
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "prompt.txt").write_text(plan["prompt"] + "\n")
    write_json(folder / "youtube.json", plan["packs"]["youtube"])
    write_json(folder / "tiktok.json", plan["packs"]["tiktok"])
    write_json(folder / "instagram.json", plan["packs"]["instagram"])
    write_json(folder / "report.json", plan["report"])
    seconds = episode_seconds(channel, episode)
    write_caption_files(folder, episode["dialogue"], seconds)
    return folder


def run_plan(prompts_path, out_dir, channel_path=None, copywriter="mock", start=None, history=()):
    channel = load_channel(channel_path)
    episodes = load_episodes(prompts_path)
    writer = get_copywriter(copywriter)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    used_titles, planned = list(history), []
    for episode in episodes:
        plan = plan_episode(channel, episode, writer, used_titles)
        used_titles.append(plan["copy"]["title"])
        write_episode(out, channel, episode, plan)
        planned.append({"id": episode["id"], "seconds": episode_seconds(channel, episode), **plan})

    ready_ids = [p["id"] for p in planned if p["report"]["ready"]]
    schedule = build_schedule(channel, ready_ids, start)
    write_json(out / "schedule.json", schedule)
    summary = [
        {"id": p["id"], "title": p["copy"]["title"], "seconds": p["seconds"], "score": p["report"]["score"],
         "ready": p["report"]["ready"], "blockers": p["report"]["blockers"]}
        for p in planned
    ]
    write_json(out / "summary.json", summary)
    return {"summary": summary, "schedule": schedule, "channel": channel}
