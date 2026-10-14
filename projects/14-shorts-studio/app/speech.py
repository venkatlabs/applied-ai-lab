"""When is each phrase actually spoken?

Primary: word timestamps from faster-whisper, aligned to the script so a misheard word cannot break the
captions. Fallback (no model available): loudness bursts from ffmpeg, which is rougher because room noise
looks like speech. Either way the output is a list of (start, end, text) cues in seconds from the clip start.
"""
import difflib
import os
import re
import subprocess
import tempfile
from pathlib import Path

PHRASE = re.compile(r"[^.:;,?!]+[.:;,?!]*")
MIN_CUE = 0.7
_model = None


def norm(token):
    return re.sub(r"[^a-z0-9']", "", token.lower())


def split_phrases(lines):
    return [p.strip() for line in lines for p in PHRASE.findall(line) if p.strip()]


def transcribe(video, log=print):
    """[{'word', 'start', 'end'}] or None when speech recognition is not available."""
    global _model
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        return None
    try:
        if _model is None:
            _model = WhisperModel(os.getenv("WHISPER_MODEL", "base.en"), device="cpu", compute_type="int8")
        with tempfile.TemporaryDirectory() as tmp:
            wav = Path(tmp) / "audio.wav"  # decode on the clip's own timeline (keeps any leading silence)
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-vn", "-ac", "1", "-ar", "16000",
                            "-af", "aresample=async=1:first_pts=0", str(wav)], check=True)
            segments, _ = _model.transcribe(str(wav), language="en", word_timestamps=True,
                                            vad_filter=False, condition_on_previous_text=False)
            return [{"word": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)}
                    for segment in segments for w in (segment.words or [])]
    except Exception as error:  # a missing model or no network must not break the render
        log(f"  speech recognition unavailable ({error}); using loudness timing instead")
        return None


def spread_cues(lines, window):
    """No usable alignment: share the speech window between phrases in proportion to their words."""
    phrases = split_phrases(lines)
    total = sum(len(p.split()) for p in phrases) or 1
    start, end = window
    cues, cursor = [], start
    for phrase in phrases:
        span = (end - start) * len(phrase.split()) / total
        cues.append([cursor, cursor + span, phrase])
        cursor += span
    return cues


def align_cues(lines, asr_words, min_match=0.5):
    """Phrase cues from real word times. None when too little of the script was recognised."""
    phrases = split_phrases(lines)
    script = [(index, norm(word)) for index, phrase in enumerate(phrases) for word in phrase.split()]
    heard = [norm(w["word"]) for w in asr_words]
    if not script or not heard:
        return None
    matcher = difflib.SequenceMatcher(None, [t for _, t in script], heard, autojunk=False)
    position = {}
    for a, b, size in matcher.get_matching_blocks():
        for k in range(size):
            position[a + k] = b + k
    if len(position) < min_match * len(script):
        return None
    cues, spans = [], []  # spans: (first, last) index into the recognised words for each phrase, or None
    for index, phrase in enumerate(phrases):
        hits = [i for i, (pi, _) in enumerate(script) if pi == index and i in position]
        if hits:
            first, last = position[hits[0]], position[hits[-1]]
            cues.append([asr_words[first]["start"], asr_words[last]["end"], phrase])
            spans.append((first, last))
        else:
            cues.append([None, None, phrase])
            spans.append(None)
    window_start, window_end = asr_words[0]["start"], asr_words[-1]["end"]
    index = 0
    while index < len(cues):  # phrases nothing matched: use the words the recogniser heard in that gap
        if cues[index][0] is not None:
            index += 1
            continue
        run = index
        while run < len(cues) and cues[run][0] is None:
            run += 1
        lo = spans[index - 1][1] + 1 if index else 0
        hi = spans[run][0] - 1 if run < len(cues) else len(asr_words) - 1
        if lo <= hi:  # something was heard here (perhaps misrecognised): trust its timing
            gap = (asr_words[lo]["start"], asr_words[hi]["end"])
        else:
            gap_start = cues[index - 1][1] if index else window_start
            gap_end = cues[run][0] if run < len(cues) else window_end
            gap = (gap_start, max(gap_end, gap_start))
        for cue, filled in zip(cues[index:run], spread_cues([c[2] for c in cues[index:run]], gap)):
            cue[0], cue[1] = filled[0], filled[1]
        index = run
    return tidy(cues)


def tidy(cues):
    """Order, give every cue a readable minimum length, and stop cues overlapping."""
    cues = sorted(([a, b, t] for a, b, t in cues), key=lambda c: c[0])
    for i, cue in enumerate(cues):
        cue[1] = max(cue[1], cue[0] + MIN_CUE)
        if i + 1 < len(cues):
            cue[1] = min(cue[1], cues[i + 1][0] - 0.03) if cues[i + 1][0] - 0.03 > cue[0] + 0.1 else cue[1]
    return [(round(a, 3), round(b, 3), t) for a, b, t in cues]


def speech_window(words):
    return (words[0]["start"], words[-1]["end"]) if words else None
