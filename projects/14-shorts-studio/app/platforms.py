"""Per-platform publishing packs built from one episode's copy."""
from .copywriter import merge_hashtags, trim_to


def hashtags_for(channel, copy, platform):
    low, high = channel["limits"]["youtube_hashtags" if platform == "youtube" else "short_form_hashtags"]
    defaults = channel["series"]["default_hashtags"]
    must_keep = ["#Shorts"] if platform == "youtube" else []
    # Niche episode tags go first so they survive the cap; #Shorts is pinned.
    tags = merge_hashtags(must_keep, copy["topic_tags"], defaults, limit=high)
    return tags


def build_packs(channel, episode, copy):
    series = channel["series"]
    ai = channel["disclosure"]["ai_generated"]

    yt_tags = hashtags_for(channel, copy, "youtube")
    youtube = {
        "title": copy["title"],
        "description": copy["description"] + "\n\n" + " ".join(yt_tags),
        "tags": [t.lstrip("#") for t in yt_tags],
        "categoryId": "23",  # Comedy
        "privacyStatus": "private",
        "selfDeclaredMadeForKids": series["audience"] == "kids",
        "containsSyntheticMedia": ai,
    }

    tt_tags = hashtags_for(channel, copy, "tiktok")
    tiktok = {
        "caption": trim_to(copy["hook_text"], 90) + " " + " ".join(t for t in tt_tags if t != "#Shorts"),
        "ai_generated_content_label": ai,
    }

    ig_tags = [t for t in hashtags_for(channel, copy, "instagram") if t != "#Shorts"]
    instagram = {
        "caption": f"{copy['hook_text']} 😅\n\n\"{episode['dialogue'][0]}\"\n\n"
        f"{series['cta']}\n\n" + " ".join(ig_tags),
        "ai_label": ai,
    }
    return {"youtube": youtube, "tiktok": tiktok, "instagram": instagram}
