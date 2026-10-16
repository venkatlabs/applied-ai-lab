"""Turn topics into episode records the planner already understands."""
import json
import os
import re
from datetime import date
from pathlib import Path

from .anthropic_api import AnthropicError, complete_json
from .shots import ShotError, normalize_episode

MOCK_TEMPLATES = [
    ("Bubbles sits at the head of a boardroom table while adults argue about {topic}; he slowly turns to the camera.",
     "Everyone has opinions about {topic}. I have a nap schedule."),
    ("Bubbles reads a tiny printed memo titled '{topic}' and rejects it with a stamp.",
     "Circling back on {topic}: denied."),
    ("Bubbles on a video call, frozen mid-sip of a sippy cup, as the team presents {topic}.",
     "This {topic} meeting could have been an email."),
]


def slug(text, limit=28):
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:limit].strip("-")


def mock_ideas(topics, start_number, today=None):
    stamp = (today or date.today()).strftime("%Y%m%d")
    episodes = []
    for offset, topic in enumerate(topics):
        scenario, line = MOCK_TEMPLATES[offset % len(MOCK_TEMPLATES)]
        name = topic["topic"]
        short = " ".join(name.split()[:4])
        episodes.append({
            "id": f"{stamp}-{slug(name)}",
            "episode": start_number + offset,
            "scenario": scenario.format(topic=short),
            "dialogue": [line.format(topic=short)],
            "hook_text": f"{short}, honestly",
            "topic_tags": ["#Trending", "#OfficeLife"],
            "clip_seconds": 8,
            "trend_source": topic["source"],
            "topic": topic["topic"],
        })
    return episodes


class IdeaError(RuntimeError):
    pass


IDEA_SYSTEM = (
    "You write episodes for an AI comedy Shorts series starring Bubbles, an 18-month-old baby boy who treats "
    "everyday baby situations like adult business, deadpan. For each trending topic return ONE episode as an "
    "object in a JSON array (one entry per topic, in order). Return null for a topic that involves disaster, severe "
    "weather, death, injury, violence, crime, illness or any ongoing tragedy. Each object has: hook_text (<=6 words), "
    "topic_tags (2 niche hashtags), shots: an array of exactly 3 shots. A shot has: delivery ('spoken' = Bubbles says "
    "ONE line to camera, <=12 words; 'voiceover' = an off-camera deadpan narrator says ONE line, <=22 words, while "
    "Bubbles' mouth stays closed), scenario (what the camera sees, with action starting immediately), dialogue (an "
    "array with ONE line), seconds (6 for spoken, 8 for voiceover). Structure: shot 1 hooks, shot 2 escalates, shot 3 "
    "pays off with a button line or image that invites a replay. Rules: one situation a viewer has lived; in a "
    "spoken shot the scenario says Bubbles looks into the camera and nothing hides his face or mouth; refer to the "
    "character by name and as 'he'; NO readable text, signs, screens with words or quoted on-screen text; no real "
    "people, brands or politics; vary the joke structure across episodes. Return ONLY the JSON array."
)


def anthropic_ideas(channel, topics, start_number, today=None):
    series = channel["series"]
    body = {
        "model": os.getenv("ANTHROPIC_MODEL", "claude-haiku-5-5"),
        "max_tokens": 2500 * max(len(topics), 1),
        "output_config": {"effort": "low"},  # Haiku 5.5 thinks by default; keep it short so the budget goes to the answer
        "cache_control": {"type": "ephemeral"},
        "system": IDEA_SYSTEM + f"\nSeries: {series['name']} - {series['tagline']}. Character: {series['character']['name']}.",
        "messages": [{"role": "user", "content": json.dumps([t["topic"] for t in topics])}],
    }
    try:
        items, _ = complete_json(body, "array", timeout=120)
    except AnthropicError as error:
        raise IdeaError(str(error)) from error
    stamp = (today or date.today()).strftime("%Y%m%d")
    episodes = []
    for offset, (topic, item) in enumerate(zip(topics, items)):
        if not isinstance(item, dict):  # the model declined a sensitive topic
            continue
        shots = item.get("shots")
        if not shots and item.get("scenario"):  # tolerate a single-shot reply
            shots = [{"scenario": item["scenario"], "dialogue": item.get("dialogue"), "delivery": "spoken"}]
        episode = {
            "id": f"{stamp}-{slug(topic['topic'])}",
            "episode": start_number + offset,
            "hook_text": item.get("hook_text") or "Wait for it",
            "topic_tags": item.get("topic_tags", []),
            "shots": shots or [],
            "trend_source": topic["source"],
            "topic": topic["topic"],
        }
        try:
            normalize_episode(channel, episode)
        except (ShotError, KeyError, TypeError):
            continue  # an unusable shot list: skip this topic rather than render a broken episode
        episodes.append(episode)
    return episodes


def bank_ideas(path, count, used_ids, start_number, channel):
    """The next `count` curated episodes from ideas/ideas_bank.jsonl that have not been used yet."""
    picked = []
    for line in Path(path).read_text().splitlines():
        if not line.strip() or len(picked) >= count:
            continue
        episode = json.loads(line)
        if episode["id"] in used_ids:
            continue
        episode["episode"] = start_number + len(picked)
        episode["topic"] = episode["hook_text"]
        episode["trend_source"] = "bank"
        picked.append(normalize_episode(channel, episode))
    return picked


def generate_ideas(channel, topics, start_number, provider="mock", today=None):
    if provider == "anthropic":
        return anthropic_ideas(channel, topics, start_number, today)
    return mock_ideas(topics, start_number, today)
