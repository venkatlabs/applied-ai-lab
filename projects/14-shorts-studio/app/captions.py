"""Burned-in captions: SRT plus an ASS style (big, bold, outlined) via ffmpeg.

Timing is estimated by spreading words evenly across the clip. Veo does not
return word timestamps, so expect ~0.3s drift; use CapCut auto-captions when
exact sync matters.
"""
import shutil
import subprocess
from pathlib import Path

from .scoring import words


def timed_lines(dialogue, seconds, lead_in=0.4):
    total = sum(len(words(line)) for line in dialogue) or 1
    window = max(seconds - lead_in - 0.3, 1)
    cursor, cues = lead_in, []
    for line in dialogue:
        span = window * len(words(line)) / total
        cues.append((cursor, cursor + span, line))
        cursor += span
    return cues


def stamp(value, sep):
    millis = int(round(value * 1000))
    h, rest = divmod(millis, 3_600_000)
    m, rest = divmod(rest, 60_000)
    s, ms = divmod(rest, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"


def ass_time(value):
    centis = int(round(value * 100))
    h, rest = divmod(centis, 360_000)
    m, rest = divmod(rest, 6000)
    s, cs = divmod(rest, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def to_srt(cues):
    return "\n".join(
        f"{i}\n{stamp(a, ',')} --> {stamp(b, ',')}\n{text}\n" for i, (a, b, text) in enumerate(cues, 1)
    )


def to_ass(cues, size=84):
    header = (
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n"
        "[V4+ Styles]\nFormat: Name,Fontname,Fontsize,PrimaryColour,OutlineColour,BackColour,Bold,"
        "BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV\n"
        f"Style: Default,Arial,{size},&H0000FFFF,&H00000000,&H64000000,1,1,6,2,2,60,60,420\n\n"
        "[Events]\nFormat: Layer,Start,End,Style,Text\n"
    )
    newline = "\\N"
    events = "".join(
        "Dialogue: 0,{},{},Default,{}\n".format(ass_time(a), ass_time(b), text.replace("\n", newline))
        for a, b, text in cues
    )
    return header + events


def write_caption_files(folder, dialogue, seconds):
    cues = timed_lines(dialogue, seconds)
    (Path(folder) / "captions.srt").write_text(to_srt(cues))
    (Path(folder) / "captions.ass").write_text(to_ass(cues))
    return cues


def burn(folder, source="raw.mp4", output="final.mp4"):
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is not installed; use CapCut auto-captions instead.")
    folder = Path(folder)
    if not (folder / source).exists():
        raise FileNotFoundError(f"{folder / source} not found; generate or download the clip first.")
    result = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", source, "-vf", "ass=captions.ass",
         "-c:a", "copy", output],
        cwd=folder, capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed")
    return folder / output
