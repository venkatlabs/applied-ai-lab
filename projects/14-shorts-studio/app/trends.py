"""Trend signals -> a short, safe list of topics for the series to riff on.

Sources: Google Trends daily RSS (no key), YouTube mostPopular (needs
YOUTUBE_API_KEY), and a hand-edited topics file. Fetchers take an injectable
`fetch` so they are tested on saved samples; live calls are UNVERIFIED here
(the build sandbox blocks both hosts).
"""
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

HT = "{https://trends.google.com/trending/rss}"

# Topics a comedy channel should not chase: tragedy, politics, health scares,
# real people, and trademarked franchises (also keeps monetization intact).
UNSAFE = (
    "dead", "death", "dies", "killed", "shooting", "attack", "war", "crash", "earthquake",
    "hurricane", "arrest", "trial", "lawsuit", "election", "trump", "biden", "harris",
    "covid", "outbreak", "cancer", "suicide", "missing", "abuse", "israel", "gaza", "ukraine",
    "tornado", "tornadoes", "storm", "storms", "flood", "flooding", "wildfire", "fire", "tsunami", "blizzard",
    "evacuation", "evacuate", "explosion", "shooter", "victim", "victims", "funeral", "hostage", "terror",
    "weather", "forecast", "warning", "emergency", "disaster", "injured", "fatal",
)


def http_get(url, headers=None, timeout=15):
    request = urllib.request.Request(url, headers=headers or {"User-Agent": "shorts-studio/1.0"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", "replace")


def google_trends(geo="US", fetch=http_get):
    root = ET.fromstring(fetch(f"https://trends.google.com/trending/rss?geo={geo}"))
    topics = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        traffic = (item.findtext(f"{HT}approx_traffic") or "0").replace("+", "").replace(",", "")
        if title:
            topics.append({"topic": title, "source": "google_trends", "score": int(traffic) if traffic.isdigit() else 0})
    return topics


def youtube_popular(api_key, region="US", fetch=http_get):
    query = urllib.parse.urlencode({
        "part": "snippet", "chart": "mostPopular", "regionCode": region,
        "maxResults": 25, "key": api_key,
    })
    data = json.loads(fetch(f"https://www.googleapis.com/youtube/v3/videos?{query}"))
    return [
        {"topic": item["snippet"]["title"], "source": "youtube_popular", "score": 1000 - rank}
        for rank, item in enumerate(data.get("items", []))
    ]


def seed_topics(path):
    path = Path(path)
    if not path.exists():
        return []
    return [
        {"topic": line.strip(), "source": "seed", "score": 1}
        for line in path.read_text().splitlines()
        if line.strip() and not line.startswith("#")
    ]


def is_safe(topic):
    text = topic.lower()
    return not any(re.search(rf"\b{re.escape(word)}\b", text) for word in UNSAFE)


def collect(sources, limit=10, used=()):
    """Merge, drop unsafe and already-used topics, keep the highest-scoring ones."""
    used_lower = {u.lower() for u in used}
    seen, kept = set(), []
    for topic in sorted((t for src in sources for t in src), key=lambda t: -t["score"]):
        key = topic["topic"].lower()
        if key in seen or key in used_lower or not is_safe(topic["topic"]):
            continue
        seen.add(key)
        kept.append(topic)
    # Seed topics always survive so a dead network never starves the pipeline.
    return kept[:limit]
