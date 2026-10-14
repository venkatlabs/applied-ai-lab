import argparse
import json
import sys
from pathlib import Path

from . import autopilot, pipeline
from .captions import burn
from .config import ROOT, ConfigError, load_channel
from .env_loader import load_dotenv
from .publish_youtube import PublishError, upload
from .state import StateError
from .video_providers import VideoProviderError, get_video_provider


def parser():
    p = argparse.ArgumentParser(prog="python3 -m app", description="Shorts Studio")
    sub = p.add_subparsers(dest="command", required=True)

    plan = sub.add_parser("plan", help="prompts -> Veo prompts, metadata, lint, schedule (free in mock mode)")
    plan.add_argument("prompts", nargs="?", default=str(ROOT / "prompts" / "bubbles_batch.jsonl"))
    plan.add_argument("--out", default=str(ROOT / "out"))
    plan.add_argument("--channel")
    plan.add_argument("--copywriter", choices=["mock", "anthropic"], default="mock")
    plan.add_argument("--start", help="first publish date, YYYY-MM-DD (default: tomorrow)")
    plan.add_argument("--history", help="text file of previously used titles, one per line")

    gen = sub.add_parser("generate", help="render clips for planned episodes")
    gen.add_argument("--out", default=str(ROOT / "out"))
    gen.add_argument("--provider", choices=["manual", "veo"], default="manual")
    gen.add_argument("--only", nargs="*", help="episode ids")
    gen.add_argument("--max-clips", type=int, default=1)
    gen.add_argument("--execute", action="store_true", help="actually spend money on video generation")

    cap = sub.add_parser("captions", help="burn captions.ass into raw.mp4 -> final.mp4 with ffmpeg")
    cap.add_argument("--out", default=str(ROOT / "out"))
    cap.add_argument("--only", nargs="*")

    pub = sub.add_parser("publish-youtube", help="upload final.mp4 as private+scheduled")
    pub.add_argument("--out", default=str(ROOT / "out"))
    pub.add_argument("--only", nargs="*")
    pub.add_argument("--execute", action="store_true")

    auto = sub.add_parser("autopilot", help="one cycle: trends -> ideas -> plan -> render -> captions -> review queue")
    auto.add_argument("--out", default=str(ROOT / "out"))
    auto.add_argument("--count", type=int, default=3)
    auto.add_argument("--ideas", choices=["mock", "anthropic"], default="mock")
    auto.add_argument("--copywriter", choices=["mock", "anthropic"], default="mock")
    auto.add_argument("--live-trends", action="store_true", help="also pull Google Trends / YouTube popular")
    auto.add_argument("--max-clips", type=int, default=1)
    auto.add_argument("--execute", action="store_true", help="render with Veo (spends money)")
    auto.add_argument("--only", help="render only this episode id (default: oldest clean planned episode)")

    ing = sub.add_parser("ingest", help="caption clips you rendered by hand (out/<id>/raw.mp4) and queue them for review")
    ing.add_argument("--out", default=str(ROOT / "out"))

    sub.add_parser("trends", help="print today's safe trending topics").add_argument("--live", action="store_true")

    rev = sub.add_parser("review", help="list episodes waiting for approval")
    rev.add_argument("--out", default=str(ROOT / "out"))
    for name in ("approve", "reject"):
        cmd = sub.add_parser(name, help=f"{name} episodes by id")
        cmd.add_argument("ids", nargs="+")
        cmd.add_argument("--out", default=str(ROOT / "out"))

    rep = sub.add_parser("report", help="markdown summary of every episode (used for the GitHub Actions run page)")
    rep.add_argument("--out", default=str(ROOT / "out"))
    rep.add_argument("--repo", help="owner/name, to link videos on the studio-data branch")

    pa = sub.add_parser("publish-approved", help="upload approved episodes as private + scheduled")
    pa.add_argument("--out", default=str(ROOT / "out"))
    pa.add_argument("--execute", action="store_true")
    return p


def episode_folders(out, only):
    summary = json.loads((Path(out) / "summary.json").read_text())
    return [row for row in summary if row["ready"] and (not only or row["id"] in only)]


def main(argv=None):
    load_dotenv(ROOT / ".env")
    args = parser().parse_args(argv)
    try:
        if args.command == "plan":
            history = Path(args.history).read_text().splitlines() if args.history else []
            result = pipeline.run_plan(args.prompts, args.out, args.channel, args.copywriter, args.start, history)
            for row in result["summary"]:
                flag = "READY  " if row["ready"] else "BLOCKED"
                print(f"{flag} {row['score']:3d}  {row['id']:<38} {row['title']}")
                for blocker in row["blockers"]:
                    print(f"           blocker: {blocker}")
            print()
            for slot in result["schedule"]:
                print(f"  {slot['local']}  {slot['id']}")
            print(f"\nWrote {args.out}/<episode>/ (prompt.txt, youtube/tiktok/instagram.json, captions) + schedule.json")
        elif args.command == "generate":
            channel_rows = episode_folders(args.out, args.only)
            limits = load_channel()["limits"]
            provider = get_video_provider(args.provider, load_channel())
            todo = channel_rows[: args.max_clips]
            if args.provider == "manual" or not args.execute:
                for row in todo:
                    print(f"[dry-run] {row['id']}: paste {args.out}/{row['id']}/prompt.txt into Google Flow (9:16).")
                if args.provider == "veo":
                    print(f"\n{len(todo)} clip(s) would be rendered. Re-run with --execute to spend credits.")
            else:
                for row in todo:
                    folder = Path(args.out) / row["id"]
                    path = provider.generate(folder, (folder / "prompt.txt").read_text(), row.get("seconds", limits["clip_seconds_max"]))
                    print(f"rendered {path}")
        elif args.command == "captions":
            for row in episode_folders(args.out, args.only):
                print("captioned", burn(Path(args.out) / row["id"]))
        elif args.command == "publish-youtube":
            schedule = {s["id"]: s for s in json.loads((Path(args.out) / "schedule.json").read_text())}
            for row in episode_folders(args.out, args.only):
                folder = Path(args.out) / row["id"]
                pack = json.loads((folder / "youtube.json").read_text())
                slot = schedule[row["id"]]["publishAt"]
                if not args.execute:
                    print(f"[dry-run] would upload {row['id']} as private, publishAt {slot}: {pack['title']}")
                else:
                    print(f"uploaded {row['id']} -> https://youtu.be/{upload(folder, pack, slot)}")
        elif args.command == "autopilot":
            autopilot.run_cycle(args.out, count=args.count, ideas=args.ideas, copywriter=args.copywriter,
                                live_trends=args.live_trends, execute=args.execute, max_clips=args.max_clips,
                                only=args.only)
            print(f"\nNext: python3 -m app review --out {args.out}")
        elif args.command == "report":
            print(autopilot.markdown_report(args.out, args.repo))
        elif args.command == "ingest":
            from .state import State
            state = State(Path(args.out) / "state.json")
            n = autopilot.ingest_manual_clips(state, args.out)
            state.save()
            print(f"{n} clip(s) queued for review." if n else "No planned episode has a raw.mp4 yet.")
        elif args.command == "trends":
            from .state import State
            channel = load_channel()
            for t in autopilot.gather_topics(channel, State(ROOT / "out" / "state.json"), 10, args.live):
                print(f"{t['score']:>9}  {t['source']:<16} {t['topic']}")
        elif args.command == "review":
            queue = autopilot.review_queue(args.out)
            for ep_id, info in queue:
                print(f"{ep_id}  score {info['score']}  \"{info['title']}\"\n    watch: {args.out}/{ep_id}/final.mp4")
            print(f"\n{len(queue)} waiting. python3 -m app approve <id> | reject <id>")
        elif args.command in ("approve", "reject"):
            autopilot.decide(args.out, args.ids, args.command == "approve")
            print(("approved: " if args.command == "approve" else "rejected: ") + ", ".join(args.ids))
        elif args.command == "publish-approved":
            autopilot.publish_approved(args.out, upload, args.execute)
    except (StateError, ConfigError, VideoProviderError, PublishError, RuntimeError, FileNotFoundError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
