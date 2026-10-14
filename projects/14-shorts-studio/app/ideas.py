"""Turn topics into episode records the planner already understands."""
import json
import os
import re
from datetime import date

from .anthropic_api import AnthropicError, complete_json

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
        })
    return episodes


class IdeaError(RuntimeError):
    pass


def anthropic_ideas(channel, topics, start_number, today=None):
    series = channel["series"]
    system = (
        "You write episode concepts for an AI comedy Shorts series. For each trending topic return one episode "
        "as JSON objects in a JSON array with keys: scenario (one visual gag, what the camera sees), dialogue "
        "(array with ONE line, <=14 words, the funny line spoken by the character), hook_text (<=6 words), "
        "topic_tags (2 niche hashtags). The joke must work from the first frame. Relatable adult situations "
        "only. In scenario, refer to the character by name and as 'he' (a baby boy), and show only things a camera "
        "sees: NO readable text, signs, screens with words, captions or quoted on-screen text. "
        "No real people, brands, tragedies, politics or medical claims. Vary setup and punchline "
        "structure across episodes; do not reuse the same joke shape. Return ONLY the JSON array."
        f"\nSeries: {series['name']} — {series['tagline']}. Character: {series['character']['name']}."
    )
    body = {
        "model": os.getenv("ANTHROPIC_MODEL", "claude-haiku-5-5"),
        "max_tokens": 400 * max(len(topics), 1),
        "cache_control": {"type": "ephemeral"},
        "system": system,
        "messages": [{"role": "user", "content": json.dumps([t["topic"] for t in topics])}],
    }
    try:
        items, _ = complete_json(body, "array", timeout=90)
    except AnthropicError as error:
        raise IdeaError(str(error)) from error
    stamp = (today or date.today()).strftime("%Y%m%d")
    episodes = []
    for offset, (topic, item) in enumerate(zip(topics, items)):
        dialogue = item.get("dialogue")
        if isinstance(dialogue, str):
            dialogue = [dialogue]
        if not (item.get("scenario") and dialogue):
            continue
        episodes.append({
            "id": f"{stamp}-{slug(topic['topic'])}",
            "episode": start_number + offset,
            "scenario": item["scenario"],
            "dialogue": dialogue,
            "hook_text": item.get("hook_text") or "Wait for it",
            "topic_tags": item.get("topic_tags", []),
            "clip_seconds": 8,
            "trend_source": topic["source"],
        })
    return episodes


def generate_ideas(channel, topics, start_number, provider="mock", today=None):
    if provider == "anthropic":
        return anthropic_ideas(channel, topics, start_number, today)
    return mock_ideas(topics, start_number, today)
