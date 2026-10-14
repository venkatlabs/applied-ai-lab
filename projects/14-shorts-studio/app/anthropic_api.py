"""One place that talks to the Anthropic Messages API, with paste-friendly keys and readable errors."""
import json
import os
import urllib.error
import urllib.request


class AnthropicError(RuntimeError):
    pass


def clean_key(raw):
    """Secrets are often pasted with a trailing newline, spaces or quotes. Strip them."""
    return (raw or "").strip().strip("\"'").strip()


def key_problem(key):
    """A non-secret hint about why a key looks wrong, or None. Never includes the key itself."""
    if not key:
        return "ANTHROPIC_API_KEY is not set (or empty)."
    if not key.startswith("sk-ant-"):
        return "the key does not start with 'sk-ant-'; it may be from another service or a different kind of token."
    if len(key) < 40 or any(c.isspace() for c in key):
        return f"the key looks truncated or contains whitespace (length {len(key)})."
    return None


def post_messages(body, timeout=60):
    key = clean_key(os.getenv("ANTHROPIC_API_KEY"))
    if not key:
        raise AnthropicError("ANTHROPIC_API_KEY is not set.")
    request = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode(),
        headers={"x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        try:
            detail = json.loads(error.read().decode()).get("error", {}).get("message", "")
        except Exception:
            detail = ""
        hint = ""
        if error.code == 401:
            hint = (" Anthropic rejected the key. " + (f"Likely cause: {key_problem(key)} " if key_problem(key) else "")
                    + "Create a fresh key at console.anthropic.com > API Keys, then replace the repository secret.")
        elif error.code == 400 and "credit" in detail.lower():
            hint = " Add credits at console.anthropic.com > Billing."
        raise AnthropicError(f"Anthropic API HTTP {error.code}: {detail or error.reason}.{hint}") from error
    except Exception as error:
        raise AnthropicError(f"Anthropic request failed: {error}") from error
