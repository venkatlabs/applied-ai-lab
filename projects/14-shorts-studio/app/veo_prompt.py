"""Build the text prompt for a Veo 3.x clip.

The character block is pasted verbatim into every prompt. That is the only
consistency mechanism text-to-video gives us, so it is checked, not trusted.
"""


def build_veo_prompt(channel, episode):
    series = channel["series"]
    character = series["character"]
    seconds = min(
        int(episode.get("clip_seconds", channel["limits"]["clip_seconds_max"])),
        channel["limits"]["clip_seconds_max"],
    )
    lines = "\n".join(
        f'{character["name"]} says in {character["voice"]}: "{line}"'
        for line in episode["dialogue"]
    )
    parts = [
        f"Character: {character['block']}",
        f"Scene: {episode['scenario']}",
        lines,
        "Camera: vertical 9:16 framing, medium close-up, subject centered in the "
        "upper two thirds of the frame, subtle handheld push-in. The first frame "
        "already shows the joke; no slow fade-in.",
        f"Style: {series['style']}.",
        f"Duration: {seconds} seconds.",
        "Audio: clear dialogue, natural room tone, no music.",
        "Do not render any text, captions, subtitles, logos or watermarks in the frame.",
    ]
    return "\n".join(parts)


def character_block_intact(channel, prompt):
    return channel["series"]["character"]["block"] in prompt
