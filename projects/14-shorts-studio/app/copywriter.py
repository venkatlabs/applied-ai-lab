"""Title / description / hashtag generation.

MockCopywriter is deterministic and free (used by evals and offline runs).
AnthropicCopywriter asks a model for sharper hooks; its output is validated by
the same scoring rules as the mock, so a bad model answer cannot ship silently.
"""
import json
import os
import re

from .anthropic_api import AnthropicError, complete_json

EMOJI_BY_TAG = {
    "#meetings": "🗓️",
    "#career": "📈",
    "#salary": "💸",
    "#jobinterview": "🎤",
    "#friday": "🎉",
    "#officelife": "🏢",
}


class CopywriterError(RuntimeError):
    pass


def trim_to(text, limit):
    if len(text) <= limit:
        return text
    cut = text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,.-—:;")
    return cut + "…"


def normalize_tag(tag):
    cleaned = re.sub(r"[^0-9A-Za-z_]", "", tag.lstrip("#"))
    return f"#{cleaned}" if cleaned else ""


def merge_hashtags(*groups, limit):
    seen, merged = set(), []
    for group in groups:
        for tag in group:
            tag = normalize_tag(tag)
            if tag and tag.lower() not in seen:
                seen.add(tag.lower())
                merged.append(tag)
    return merged[:limit]


class MockCopywriter:
    name = "mock"

    def write(self, channel, episode):
        series = channel["series"]
        limit = channel["limits"]["title_max_chars"]
        hook = episode.get("hook_text") or episode["dialogue"][0]
        emoji = next(
            (EMOJI_BY_TAG[t.lower()] for t in episode.get("topic_tags", []) if t.lower() in EMOJI_BY_TAG),
            "😂",
        )
        title = episode.get("title") or trim_to(f"{hook} {emoji}", limit)
        alternatives = [
            trim_to(f"POV: {hook.lower()}", limit),
            trim_to(f"{series['character']['name']} has had enough {emoji}", limit),
        ]
        description = (
            f"{hook}. {episode['scenario'].split('.')[0]}.\n\n"
            f"\"{episode['dialogue'][0]}\" — {series['character']['name']}\n\n"
            f"{series['name']}: {series['tagline']}\n{series['cta']}"
        )
        return {
            "title": title,
            "title_alternatives": alternatives,
            "hook_text": hook,
            "description": description,
            "topic_tags": episode.get("topic_tags", []),
        }


class AnthropicCopywriter:
    name = "anthropic"

    STABLE_SYSTEM = (
        "You write metadata for faceless AI comedy Shorts. Return ONLY JSON with keys: "
        "title (<=50 chars, curiosity or relatable-pain hook, at most one emoji), "
        "title_alternatives (2 strings, each <=50 chars), hook_text (<=6 words, shown "
        "on screen in the first second), description (2-4 short lines, first line "
        "repeats the hook, no hashtags), topic_tags (2 niche hashtags). Never claim "
        "the content is real footage. Never use real people, brands or trademarks."
    )

    def write(self, channel, episode):
        series = channel["series"]
        body = {
            "model": os.getenv("ANTHROPIC_MODEL", "claude-haiku-5-5"),
            "max_tokens": 1000,
            "cache_control": {"type": "ephemeral"},
            "system": self.STABLE_SYSTEM
            + f"\nSeries: {series['name']} — {series['tagline']} Audience: {series['audience']}.",
            "messages": [
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "scenario": episode["scenario"],
                            "dialogue": episode["dialogue"],
                            "hook_text": episode.get("hook_text"),
                        }
                    ),
                }
            ],
        }
        try:
            result, payload = complete_json(body, "object")
        except AnthropicError as error:
            raise CopywriterError(str(error)) from error
        for key in ("title", "hook_text", "description"):
            if not isinstance(result.get(key), str) or not result[key].strip():
                raise CopywriterError(f"Model output missing '{key}'.")
        result.setdefault("title_alternatives", [])
        result.setdefault("topic_tags", [])
        result["_usage"] = payload.get("usage", {})
        return result


def get_copywriter(name):
    return AnthropicCopywriter() if name == "anthropic" else MockCopywriter()
