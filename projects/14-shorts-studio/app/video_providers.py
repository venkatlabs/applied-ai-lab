"""Clip generation providers.

manual: write the prompt, you paste it into Google Flow / Gemini / AI Studio.
veo:    call the Gemini API (google-genai SDK). Spends real money per second of
        video, so it needs --execute and is capped by --max-clips.
        UNVERIFIED against a live key: written from the SDK's documented
        generate_videos / operations.get / files.download flow.
"""
import os
import time
from pathlib import Path


class VideoProviderError(RuntimeError):
    pass


class ManualProvider:
    name = "manual"

    def generate(self, folder, prompt, seconds):
        return None  # prompt.txt is already written; nothing to render


class VeoProvider:
    name = "veo"

    def __init__(self, model=None, poll_seconds=10, timeout_seconds=600):
        self.model = os.getenv("VEO_MODEL") or model or "veo-3.1-fast-generate-preview"
        self.poll_seconds = poll_seconds
        self.timeout_seconds = timeout_seconds

    def generate(self, folder, prompt, seconds):
        try:
            from google import genai
            from google.genai import types
        except ImportError as error:
            raise VideoProviderError("pip install google-genai to use the veo provider.") from error
        if not os.getenv("GEMINI_API_KEY"):
            raise VideoProviderError("GEMINI_API_KEY is not set.")
        seconds = next((s for s in (4, 6, 8) if s >= seconds), 8)  # Veo only accepts 4, 6 or 8
        client = genai.Client()
        operation = client.models.generate_videos(
            model=self.model,
            prompt=prompt,
            config=types.GenerateVideosConfig(aspect_ratio="9:16", duration_seconds=seconds),
        )
        deadline = time.time() + self.timeout_seconds
        while not operation.done:
            if time.time() > deadline:
                raise VideoProviderError("Veo generation timed out.")
            time.sleep(self.poll_seconds)
            operation = client.operations.get(operation)
        videos = getattr(operation.response, "generated_videos", None)
        if not videos:
            raise VideoProviderError("Veo returned no video (possibly blocked by safety filters).")
        client.files.download(file=videos[0].video)
        target = Path(folder) / "raw.mp4"
        videos[0].video.save(str(target))
        return target


def get_video_provider(name, channel=None):
    if name == "veo":
        return VeoProvider(model=((channel or {}).get("veo") or {}).get("model"))
    return ManualProvider()
