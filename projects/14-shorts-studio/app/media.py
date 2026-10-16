"""Turn raw Veo clips into one finished vertical video.

Per shot: find when the speech really happens, trim dead air before it and silence after it, remove baked-in
black bars, then time the captions to the words. Then join the shots and burn the captions in.
"""
import json
import shutil
import subprocess
from pathlib import Path

from . import speech
from .captions import bars_filter, speech_bursts, to_ass, to_srt

LEAD_IN = 0.25      # seconds kept before the first word
LEAD_TRIM_MAX = 1.5  # never cut more than this off the start (the action may begin before the voice)
TAIL = 0.7          # seconds kept after the last word
MIN_SHOT = 2.0


def ffprobe_duration(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                            capture_output=True, text=True)
    return float(result.stdout.strip())


def run_ffmpeg(args, cwd=None):
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is not installed.")
    result = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed")


def plan_trim(window, full):
    """(start, length) to keep: a short lead-in before the first word and a short tail after the last."""
    if not window:
        return 0.0, full
    start = min(max(window[0] - LEAD_IN, 0.0), LEAD_TRIM_MAX)
    end = min(full, window[1] + TAIL)
    if end - start < MIN_SHOT:
        end = min(full, start + MIN_SHOT)
    return start, end - start


def prepare_shot(raw, out, dialogue, size, log=print, words=None):
    """Trim, de-bar and re-encode one clip. Returns {'path', 'duration', 'cues', 'timing'}."""
    raw, out = Path(raw), Path(out)
    full = ffprobe_duration(raw)
    cues, window, timing = [], None, "none"
    if dialogue:
        words = words if words is not None else speech.transcribe(raw, log)
        if words:
            window = speech.speech_window(words)
            cues = speech.align_cues(dialogue, words) or speech.spread_cues(dialogue, window)
            timing = "words"
        else:
            bursts = speech_bursts(raw)
            if bursts:
                window = (bursts[0][0], bursts[-1][1])
                phrases = speech.split_phrases(dialogue)
                cues = ([(a, b, t) for (a, b), t in zip(bursts, phrases)] if len(phrases) == len(bursts)
                        else speech.spread_cues(dialogue, window))
                timing = "loudness"
        (out.parent / f"{out.stem}_timing.json").write_text(json.dumps(
            {"timing": timing, "window": window, "words": words or [], "cues": [list(c) for c in cues]}, indent=2))
    start, length = plan_trim(window, full)
    width, height = size
    chain = [bars_filter(raw) or "null",
             f"scale={width}:{height}:force_original_aspect_ratio=increase", f"crop={width}:{height}", "fps=24",
             "format=yuv420p"]
    run_ffmpeg(["-ss", f"{start:.3f}", "-t", f"{length:.3f}", "-i", str(raw), "-vf", ",".join(chain),
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-ar", "48000", "-ac", "2",
                str(out)])
    duration = ffprobe_duration(out)
    shifted = [(max(a - start, 0.0), min(max(b - start, 0.1), duration), t) for a, b, t in cues]
    log(f"    {raw.name}: speech {timing}, trimmed {start:.2f}s from the start, kept {duration:.2f}s")
    return {"path": out, "duration": duration, "cues": shifted, "timing": timing}


def assemble(folder, shots, output="final.mp4"):
    """Join prepared shots, write captions on one timeline and burn them in."""
    folder = Path(folder)
    cues, offset = [], 0.0
    for shot in shots:
        cues += [(a + offset, b + offset, t) for a, b, t in shot["cues"]]
        offset += shot["duration"]
    (folder / "captions.srt").write_text(to_srt(cues))
    (folder / "captions.ass").write_text(to_ass(cues))
    (folder / "shots.txt").write_text("".join(f"file '{Path(s['path']).name}'\n" for s in shots))
    run_ffmpeg(["-f", "concat", "-safe", "0", "-i", "shots.txt", "-vf", "ass=captions.ass",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-movflags", "+faststart", output], cwd=folder)
    return folder / output


def raw_clip_path(folder, number, shot_count):
    """raw_1.mp4 ... raw_N.mp4; a lone raw.mp4 (rendered by hand in Flow) counts as shot 1 of a one-shot episode."""
    folder = Path(folder)
    numbered = folder / f"raw_{number}.mp4"
    if numbered.exists() or not (shot_count == 1 and (folder / "raw.mp4").exists()):
        return numbered
    return folder / "raw.mp4"


def finish_episode(folder, shots, size, log=print):
    """Every shot's raw clip -> one captioned final.mp4. `shots` = [{'dialogue': [...]}...]."""
    folder = Path(folder)
    prepared = []
    for number, shot in enumerate(shots, 1):
        raw = raw_clip_path(folder, number, len(shots))
        if not raw.exists():
            raise FileNotFoundError(f"{raw} is missing; render that shot first.")
        prepared.append(prepare_shot(raw, folder / f"shot_{number}.mp4", shot.get("dialogue", []), size, log))
    return assemble(folder, prepared)
