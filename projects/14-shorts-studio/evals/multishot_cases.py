"""Evals for multi-shot episodes, the idea bank, prompts, speech timing, trimming and the render loop."""
import shutil
import subprocess
import tempfile
from pathlib import Path

from app import autopilot, speech
from app.config import ROOT, load_episodes
from app.copywriter import MockCopywriter
from app.ideas import bank_ideas
from app.media import finish_episode, ffprobe_duration, plan_trim
from app.pipeline import plan_episode
from app.shots import ShotError, normalize_episode
from app.state import State
from app.veo_prompt import build_episode_prompts


def synthetic_clip(path, tone=(2.4, 3.0), bars=True):
    """720x1280, 8 s, with a tone starting at tone[0] lasting tone[1] seconds (our stand-in for speech)."""
    pad = "pad=720:1280:0:100:black" if bars else "null"
    size = "720x1080" if bars else "720x1280"
    ms = int(tone[0] * 1000)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"testsrc2=s={size}:d=8:r=24",
                    "-filter_complex", f"sine=frequency=440:duration={tone[1]}[s];[s]adelay={ms}|{ms},apad=whole_dur=8[a]",
                    "-map", "0:v", "-map", "[a]", "-vf", pad, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac",
                    "-t", "8", str(path)], check=True)


class FakeRenderer:
    """Stands in for Veo: writes a synthetic clip and counts calls. Can fail on the Nth call."""
    def __init__(self, fail_on=None):
        self.calls, self.fail_on = [], fail_on

    def generate(self, folder, prompt, seconds, filename="raw.mp4"):
        self.calls.append(filename)
        if self.fail_on == len(self.calls):
            raise RuntimeError("Veo timed out")
        synthetic_clip(Path(folder) / filename)
        return Path(folder) / filename


def run(case, channel):
    # --- shots
    one = normalize_episode(channel, {"id": "x", "scenario": "S.", "dialogue": ["Hi."], "clip_seconds": 6})
    case("old-style episode becomes one shot", len(one["shots"]) == 1 and one["total_seconds"] == 6)
    snap = normalize_episode(channel, {"id": "x", "shots": [{"scenario": "A", "seconds": 7}, {"scenario": "B", "seconds": 5}]})
    case("shot lengths snap to what Veo accepts (4, 6, 8)", [s["seconds"] for s in snap["shots"]] == [8, 6])
    for name, episode in (("invalid delivery", {"id": "x", "shots": [{"scenario": "A", "delivery": "mime"}]}),
                          ("too many shots", {"id": "x", "shots": [{"scenario": "A"}] * 5})):
        try:
            normalize_episode(channel, episode)
            case(f"{name} is rejected", False)
        except ShotError:
            case(f"{name} is rejected", True)

    # --- the idea bank
    bank = load_episodes(ROOT / "ideas" / "ideas_bank.jsonl", channel)
    titles, flagged = [], []
    for episode in bank:
        plan = plan_episode(channel, episode, MockCopywriter(), titles)
        titles.append(plan["copy"]["title"])
        bad = [c["name"] for c in plan["report"]["checks"] if not c["ok"]]
        if bad:
            flagged.append((episode["id"], bad))
    case("idea bank: every episode passes every check", not flagged, flagged)
    case("idea bank: unique ids and at least 15 s each",
         len({e["id"] for e in bank}) == len(bank) and all(e["total_seconds"] >= 15 for e in bank), len(bank))
    case("idea bank: a mix of spoken and voiceover shots",
         any(s["delivery"] == "voiceover" for e in bank for s in e["shots"]) and any(s["delivery"] == "spoken" for e in bank for s in e["shots"]))
    picked = bank_ideas(ROOT / "ideas" / "ideas_bank.jsonl", 2, {bank[0]["id"]}, 7, channel)
    case("bank skips used ideas and numbers new ones", [e["id"] for e in picked] == [bank[1]["id"], bank[2]["id"]] and picked[0]["episode"] == 7)

    # --- prompts
    prompts = build_episode_prompts(channel, bank[0])
    block = channel["series"]["character"]["block"]
    case("every shot prompt has the character block", all(block in p for p in prompts))
    case("spoken shot: quoted line, face to lens, immediate start",
         '"' in prompts[0] and "mouth fully visible" in prompts[0] and "begin on the very first frame" in prompts[0])
    case("voiceover shot: narrator speaks, Bubbles stays silent", "voice-over" in prompts[2] and "mouth stays closed" in prompts[2])
    case("later shots continue the scene", "Continuing directly" in prompts[1] and "Continuing directly" not in prompts[0])

    # --- lint: lip-sync-friendly scenes
    def lint_flags(scenario):
        episode = {"id": "t", "shots": [{"scenario": scenario, "dialogue": ["Hello there."], "delivery": "spoken"},
                                         {"scenario": "Bubbles looks into the camera.", "dialogue": ["Okay."], "delivery": "spoken"},
                                         {"scenario": "Bubbles looks into the camera.", "dialogue": ["Fine."], "delivery": "spoken"}],
                   "hook_text": "Hi", "topic_tags": []}
        return {c["name"] for c in plan_episode(channel, episode, MockCopywriter(), [])["report"]["checks"] if not c["ok"]}
    case("covering the mouth in a spoken shot is flagged", "mouth_visible" in lint_flags("Bubbles covers his mouth and looks into the camera."))
    case("an adult hiding or 'back to the camera' wording is not a false alarm",
         "mouth_visible" not in lint_flags("An adult hides behind a blanket; Bubbles looks down then back to the camera."))
    case("a spoken shot that never mentions the camera is flagged", "shots_have_camera_facing" in lint_flags("Bubbles sits in a chair."))

    # --- speech timing
    words = [{"word": "Hard", "start": 2.5, "end": 2.8}, {"word": "pass", "start": 2.85, "end": 3.2}, {"word": "Nest", "start": 3.9, "end": 4.3}]
    cues = speech.align_cues(["Hard pass. Next."], words)
    case("captions use real word times even when a word is misheard",
         cues and cues[0][:2] == (2.5, 3.2) and cues[1][0] == 3.9 and cues[1][2] == "Next.", cues)
    case("garbage recognition falls back instead of mis-timing", speech.align_cues(["Hard pass."], [{"word": "zzz", "start": 1, "end": 2}]) is None)
    tidy = speech.tidy([(0.0, 0.2, "a"), (0.5, 0.9, "b")])
    case("cues never overlap and have a readable minimum length", tidy[0][1] <= tidy[1][0] and all(b - a >= 0.3 for a, b, _ in tidy), tidy)

    # --- model download without the huggingface_hub library (a local fake server stands in for the internet)
    import http.server
    import os
    import threading
    served = {"config.json": b"{}", "model.bin": b"x" * 500, "tokenizer.json": b"{}", "vocabulary.txt": b"a\n"}

    class Fake(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            body = served.get(self.path.rsplit("/", 1)[-1])
            self.send_response(200 if body is not None else 404)
            self.end_headers()
            if body is not None:
                self.wfile.write(body)

        def log_message(self, *args):
            pass

    server = http.server.HTTPServer(("127.0.0.1", 0), Fake)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    with tempfile.TemporaryDirectory() as cache:
        old = {k: os.environ.get(k) for k in ("SHORTS_MODEL_DIR", "SHORTS_MODEL_BASE")}
        os.environ["SHORTS_MODEL_DIR"], os.environ["SHORTS_MODEL_BASE"] = cache, f"http://127.0.0.1:{server.server_port}/"
        try:
            folder = speech.model_dir("base.en")
            have = sorted(p.name for p in Path(folder).iterdir())
            case("speech model downloads over plain HTTPS; optional files that 404 are skipped",
                 have == ["config.json", "model.bin", "tokenizer.json", "vocabulary.txt"], have)
            served.clear()
            case("a second call uses the cached model without the network", speech.model_dir("base.en") == folder)
        finally:
            for k, v in old.items():
                os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)
            server.shutdown()

    # --- trimming
    case("dead air before the voice is trimmed (leaving a short lead-in)", plan_trim((0.6, 3.0), 8) == (0.35, 3.35 + 0.0) or abs(plan_trim((0.6, 3.0), 8)[0] - 0.35) < 1e-6)
    case("trim never cuts more than the cap off the start", plan_trim((5.0, 6.0), 8)[0] == 1.5)
    case("a shot with no speech is left whole", plan_trim(None, 8) == (0.0, 8))

    # --- full pipeline on synthetic media (needs ffmpeg)
    if not shutil.which("ffmpeg"):
        case("ffmpeg unavailable: media evals skipped", True)
        return
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        for n in (1, 2):
            synthetic_clip(folder / f"raw_{n}.mp4")
        final = finish_episode(folder, [{"dialogue": ["Hard pass. Next."]}, {"dialogue": ["Order in the court."]}], (720, 1280))
        duration = ffprobe_duration(final)
        case("finished video is shorter than the raw clips combined (dead air removed)", 6 < duration < 14, duration)
        srt = (folder / "captions.srt").read_text()
        first = srt.split("-->")[0].split("\n")[-1].strip()
        case("captions start only once the sound starts (sound is ~0.9 s in after trimming)", first.startswith("00:00:00,9") or first.startswith("00:00:01,0"), first)
        crop = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(final), "-vf", "cropdetect=24:2:0", "-f", "null", "-"],
                              capture_output=True, text=True).stderr
        case("baked-in black bars are gone from the final video", "crop=720:1280:0:0" in crop)

    # --- render loop with a fake Veo: resume after a failure, never half-render, never exceed the clip budget
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp)
        quiet = lambda *_: None
        autopilot.run_cycle(out, count=1, ideas="bank", execute=True, max_clips=2, renderer=FakeRenderer(), log=quiet)
        state = State(out / "state.json")
        case("an episode needing 3 clips is not started with a 2-clip allowance",
             state.data["spend_usd"] == 0 and state.with_status("planned") != [], state.data["spend_usd"])
        flaky = FakeRenderer(fail_on=2)
        try:
            autopilot.run_cycle(out, count=0, ideas="bank", execute=True, max_clips=3, renderer=flaky, log=quiet)
        except RuntimeError:
            pass
        state = State(out / "state.json")
        case("a failure mid-episode keeps the cost of the clip already paid for", state.data["spend_usd"] == 0.9, state.data["spend_usd"])
        retry = FakeRenderer()
        autopilot.run_cycle(out, count=0, ideas="bank", execute=True, max_clips=3, renderer=retry, log=quiet)
        state = State(out / "state.json")
        done = state.with_status("pending_review")
        case("retry renders only the missing shots (no double charge for shot 1)",
             retry.calls == ["raw_2.mp4", "raw_3.mp4"] and len(done) == 1 and abs(state.data["spend_usd"] - 3.0) < 1e-9,
             (retry.calls, state.data["spend_usd"]))
        case("the finished episode has a captioned final.mp4", (out / done[0] / "final.mp4").exists())
