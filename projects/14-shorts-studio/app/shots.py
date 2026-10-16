"""Episodes are 1-4 shots; each shot is one Veo clip (4, 6 or 8 seconds).

An episode may be written the old way (scenario + dialogue + clip_seconds) or with a `shots` list.
normalize_episode makes both look the same and keeps the flat `scenario` / `dialogue` fields the
copywriter and lint use.
"""

ALLOWED_SECONDS = (4, 6, 8)
DELIVERIES = ("spoken", "voiceover")
MAX_SHOTS = 4


class ShotError(ValueError):
    pass


def snap_seconds(value, maximum=8):
    """Veo only renders 4, 6 or 8 seconds: round up to the nearest allowed length."""
    value = min(int(value), maximum)
    return next((s for s in ALLOWED_SECONDS if s >= value), ALLOWED_SECONDS[-1])


def _lines(value):
    if value is None:
        return []
    return [value] if isinstance(value, str) else list(value)


def normalize_episode(channel, episode):
    maximum = channel["limits"]["clip_seconds_max"]
    raw_shots = episode.get("shots")
    if raw_shots:
        if len(raw_shots) > MAX_SHOTS:
            raise ShotError(f"{episode.get('id')}: at most {MAX_SHOTS} shots")
        shots = []
        for number, shot in enumerate(raw_shots, 1):
            if not shot.get("scenario"):
                raise ShotError(f"{episode.get('id')}: shot {number} has no scenario")
            delivery = shot.get("delivery", "spoken")
            if delivery not in DELIVERIES:
                raise ShotError(f"{episode.get('id')}: shot {number} delivery must be one of {DELIVERIES}")
            shots.append({
                "scenario": shot["scenario"],
                "dialogue": _lines(shot.get("dialogue")),
                "delivery": delivery,
                "seconds": snap_seconds(shot.get("seconds", maximum), maximum),
            })
    else:
        shots = [{
            "scenario": episode["scenario"],
            "dialogue": _lines(episode.get("dialogue")),
            "delivery": episode.get("delivery", "spoken"),
            "seconds": snap_seconds(episode.get("clip_seconds", maximum), maximum),
        }]
    episode["shots"] = shots
    episode["scenario"] = " Then ".join(s["scenario"] for s in shots)
    episode["dialogue"] = [line for s in shots for line in s["dialogue"]]
    episode["total_seconds"] = sum(s["seconds"] for s in shots)
    return episode


def total_seconds(episode):
    return sum(s["seconds"] for s in episode["shots"])
