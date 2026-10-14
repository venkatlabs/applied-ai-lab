import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIRED_EPISODE_FIELDS = ("id", "scenario", "dialogue")


class ConfigError(ValueError):
    pass


def load_channel(path=None):
    path = Path(path) if path else ROOT / "channel.json"
    try:
        channel = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise ConfigError(f"Cannot read channel config {path}: {error}") from error
    for key in ("channel", "series", "limits"):
        if key not in channel:
            raise ConfigError(f"channel.json is missing '{key}'.")
    if not channel["series"].get("character", {}).get("block"):
        raise ConfigError("channel.json series.character.block is required.")
    return channel


def load_episodes(path):
    episodes = []
    for number, line in enumerate(Path(path).read_text().splitlines(), start=1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        try:
            episode = json.loads(line)
        except json.JSONDecodeError as error:
            raise ConfigError(f"{path}:{number}: invalid JSON ({error})") from error
        missing = [key for key in REQUIRED_EPISODE_FIELDS if not episode.get(key)]
        if missing:
            raise ConfigError(f"{path}:{number}: missing {', '.join(missing)}")
        if isinstance(episode["dialogue"], str):
            episode["dialogue"] = [episode["dialogue"]]
        episodes.append(episode)
    ids = [episode["id"] for episode in episodes]
    duplicates = {item for item in ids if ids.count(item) > 1}
    if duplicates:
        raise ConfigError(f"Duplicate episode ids: {', '.join(sorted(duplicates))}")
    return episodes
