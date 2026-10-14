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


def extract_json(text, expect):
    """First JSON value in `text` of the wanted kind ('object' or 'array'); tolerates code fences and extra prose."""
    opener = "{" if expect == "object" else "["
    decoder = json.JSONDecoder()
    start = text.find(opener)
    while start != -1:
        try:
            value, _ = decoder.raw_decode(text[start:])
            if isinstance(value, dict if expect == "object" else list):
                return value
        except json.JSONDecodeError:
            pass
        start = text.find(opener, start + 1)
    return None


def complete_json(body, expect="object", timeout=60, attempts=2):
    """Call the model and return (parsed_json, payload). Retries once when the reply holds no usable JSON."""
    last = ""
    for _ in range(attempts):
        payload = post_messages(body, timeout)
        text = "".join(b.get("text", "") for b in payload.get("content", []) if b.get("type") == "text")
        parsed = extract_json(text, expect)
        if parsed is not None:
            return parsed, payload
        snippet = " ".join(text.split())[:160]
        last = f"stop_reason={payload.get('stop_reason')}, reply began: {snippet!r}"
    raise AnthropicError(f"Model did not return a JSON {expect} after {attempts} attempts ({last}).")
