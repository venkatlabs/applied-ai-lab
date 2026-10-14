"""Burned-in captions: SRT plus an ASS style (big, bold, outlined) via ffmpeg.

Timing is estimated by spreading words evenly across the clip. Veo does not
return word timestamps, so expect ~0.3s drift; use CapCut auto-captions when
exact sync matters.
"""
import re
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


def detect_content_crop(video, min_bar_fraction=0.03):
    """Some renders carry black bars baked into the frame. Return (w, h, x, y) of the real picture, or None."""
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-ss", "1", "-t", "3", "-i", str(video), "-vf", "cropdetect=24:2:0", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    size = re.search(r"Video: .*?, (\d{3,4})x(\d{3,4})", result.stderr)
    crops = re.findall(r"crop=(\d+):(\d+):(\d+):(\d+)", result.stderr)
    if not size or not crops:
        return None
    width, height = int(size.group(1)), int(size.group(2))
    best = max(set(crops), key=crops.count)
    cw, ch, x, y = map(int, best)
    if cw >= width * (1 - min_bar_fraction) and ch >= height * (1 - min_bar_fraction):
        return None
    return cw, ch, x, y, width, height


def video_filter(video):
    """Crop away baked-in bars, scale the picture to fill the original frame, then burn captions."""
    crop = detect_content_crop(video)
    if not crop:
        return "ass=captions.ass"
    cw, ch, x, y, width, height = crop
    return (f"crop={cw}:{ch}:{x}:{y},scale={width}:{height}:force_original_aspect_ratio=increase,"
            f"crop={width}:{height},ass=captions.ass")


def burn(folder, source="raw.mp4", output="final.mp4"):
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is not installed; use CapCut auto-captions instead.")
    folder = Path(folder)
    if not (folder / source).exists():
        raise FileNotFoundError(f"{folder / source} not found; generate or download the clip first.")
    result = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", source, "-vf", video_filter(folder / source),
         "-c:a", "copy", output],
        cwd=folder, capture_output=True, text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed")
    return folder / output


def speech_bursts(video, noise_db=-35, min_silence=0.25, merge_gap=0.6):
    """Find spoken stretches from audio loudness (ffmpeg silencedetect). Returns [(start, end)]."""
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(video), "-af",
         f"silencedetect=noise={noise_db}dB:d={min_silence}", "-vn", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    starts = [float(m) for m in re.findall(r"silence_start: ([\d.]+)", result.stderr)]
    ends = [float(m) for m in re.findall(r"silence_end: ([\d.]+)", result.stderr)]
    total = None
    match = re.search(r"Duration: (\d+):(\d+):([\d.]+)", result.stderr)
    if match:
        h, m, sec = match.groups()
        total = int(h) * 3600 + int(m) * 60 + float(sec)
    # Speech = the gaps between silences.
    silences = list(zip(sorted(starts), sorted(ends) + ([total] if len(ends) < len(starts) and total else [])))
    bursts, cursor = [], 0.0
    for sil_start, sil_end in silences:
        if sil_start - cursor > 0.15:
            bursts.append([cursor, sil_start])
        cursor = sil_end
    if total and total - cursor > 0.15:
        bursts.append([cursor, total])
    merged = []
    for start, end in bursts:
        if merged and start - merged[-1][1] < merge_gap:
            merged[-1][1] = end
        else:
            merged.append([start, end])
    return [(a, b) for a, b in merged]


def cues_from_speech(dialogue, bursts):
    """Spread the spoken words over the detected bursts, proportional to burst length."""
    all_words = [w for line in dialogue for w in line.split()]
    if not bursts or not all_words:
        return None
    phrases = [p.strip() for line in dialogue for p in re.findall(r"[^.:;,?!]+[.:;,?!]*", line) if p.strip()]
    if len(phrases) == len(bursts):
        return [(a, b, phrase) for (a, b), phrase in zip(bursts, phrases)]
    bursts = list(bursts)
    while len(bursts) > len(all_words):  # extra bursts are room noise: merge the closest pair
        gap, i = min((bursts[k + 1][0] - bursts[k][1], k) for k in range(len(bursts) - 1))
        bursts[i:i + 2] = [(bursts[i][0], bursts[i + 1][1])]
    total = sum(b - a for a, b in bursts)
    cues, index = [], 0
    for position, (start, end) in enumerate(bursts):
        if position == len(bursts) - 1:
            count = len(all_words) - index
        else:
            count = max(1, round(len(all_words) * (end - start) / total))
            count = max(1, min(count, len(all_words) - index - (len(bursts) - position - 1)))
        chunk = all_words[index:index + count]
        index += count
        if chunk:
            cues.append((start, end, " ".join(chunk)))
    return cues
