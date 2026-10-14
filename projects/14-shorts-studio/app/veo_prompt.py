"""Build the text prompts for Veo 3.x clips, one per shot.

The character block is pasted verbatim into every prompt. That is the only
consistency mechanism text-to-video gives us, so it is checked, not trusted.

Two delivery modes:
  spoken     Bubbles talks to the camera: short line, face to lens, mouth unobstructed (best chance at lip-sync).
  voiceover  an off-camera narrator speaks while Bubbles' mouth stays closed (no lip-sync to get wrong).
"""

PACING = ("Pacing: the action and the sound begin on the very first frame. No pause, no fade-in and "
          "no still pose before something happens.")
CAMERA = ("Camera: vertical 9:16 framing, medium close-up, subject centered in the upper two thirds "
          "of the frame, subtle handheld push-in. The first frame already shows the joke.")


def _speech_lines(channel, shot):
    series = channel["series"]
    character = series["character"]
    lines = shot["dialogue"]
    if not lines:
        return ["No one speaks."]
    if shot["delivery"] == "voiceover":
        narrator = series.get("narrator_voice", "a dry, deadpan adult male voice")
        spoken = [f'{narrator.capitalize()}, speaking off-camera as a voice-over, says: "{line}"' for line in lines]
        spoken.append(f"{character['name']} does not speak and his mouth stays closed.")
        return spoken
    spoken = [f'{character["name"]} says in {character["voice"]}: "{line}"' for line in lines]
    spoken.append(f"{character['name']} looks straight into the camera with his mouth fully visible and speaks "
                  "slowly and clearly in one take; nothing covers his mouth.")
    return spoken


def build_shot_prompt(channel, episode, index):
    series = channel["series"]
    shot = episode["shots"][index]
    scene = shot["scenario"]
    if index:
        scene = f"Continuing directly from the previous shot, same place, lighting and outfit. {scene}"
    parts = [
        f"Character: {series['character']['block']}",
        f"Scene: {scene}",
        *_speech_lines(channel, shot),
        PACING,
        CAMERA,
        f"Style: {series['style']}.",
        f"Duration: {shot['seconds']} seconds.",
        "Audio: clear voice, natural room tone, no music.",
        "Do not render any text, captions, subtitles, logos or watermarks in the frame.",
    ]
    return "\n".join(parts)


def build_episode_prompts(channel, episode):
    return [build_shot_prompt(channel, episode, i) for i in range(len(episode["shots"]))]


def build_veo_prompt(channel, episode):
    """First shot's prompt (kept for single-shot callers)."""
    return build_shot_prompt(channel, episode, 0)


def character_block_intact(channel, prompt):
    return channel["series"]["character"]["block"] in prompt
