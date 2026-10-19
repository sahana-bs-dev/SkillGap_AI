"""
Thin wrapper around the Gemini API (google-genai SDK — NOT the deprecated
google-generativeai package) so every agent that uses Gemini goes through
one place, mirroring GroqClient's shape in groq_client.py.

Env vars: GEMINI_API_KEY (required), GEMINI_API_KEY_2 (optional, backup key)
Install: pip install google-genai

Error handling (Phase 10):
- 503 / UNAVAILABLE / 504 / overloaded (server busy): retried with
  exponential backoff + small random jitter, then next model, then next key.
- Per-minute rate limit (429 without a daily-quota marker): waits for the
  retry delay Gemini asks for (capped), then retries the same model.
- Daily quota used up (429 with a "PerDay" marker): NOT retried; moves on to
  the next model, then the next API key.
- If every key/model failed, the error reflects the LAST failure type:
  a friendly quota message only if the last failures were quota, otherwise
  the original busy error (which BaseAgent knows how to retry).
"""

import json
import os
import random
import re
import time

from google import genai
from google.genai import types

FALLBACK_MODEL = "gemini-3.8-flash"
_KEY_ENV_NAMES = ("GEMINI_API_KEY", "GEMINI_API_KEY_2")
_BUSY_MARKERS = ("503", "UNAVAILABLE", "504", "DEADLINE_EXCEEDED", "overloaded")
_QUOTA_MARKERS = ("429", "RESOURCE_EXHAUSTED")
_DAILY_QUOTA_MARKERS = ("PerDay", "per day", "daily")

_ATTEMPTS_PER_MODEL = 3
_BACKOFF_BASE_SECONDS = 2      # waits 2s, 4s, 8s ... (plus jitter)
_BACKOFF_MAX_SECONDS = 20
_DEFAULT_RATE_WAIT_SECONDS = 10  # used when Gemini does not say how long to wait
_MAX_RATE_WAIT_SECONDS = 20      # never block a request longer than this

_RETRY_DELAY_PATTERNS = (
    re.compile(r"retry in ([\d.]+)\s*s", re.IGNORECASE),
    re.compile(r"retryDelay['\"]?\s*:\s*['\"]?([\d.]+)s", re.IGNORECASE),
)

_clients: dict[str, genai.Client] = {}


def _get_api_keys() -> list[str]:
    keys = []
    for env_name in _KEY_ENV_NAMES:
        value = os.environ.get(env_name)
        if value and value.strip():
            keys.append(value.strip())
    if not keys:
        raise RuntimeError("GEMINI_API_KEY is not set")
    return keys


def _get_client(api_key: str) -> genai.Client:
    if api_key not in _clients:
        _clients[api_key] = genai.Client(api_key=api_key)
    return _clients[api_key]


def _backoff_seconds(attempt: int) -> float:
    """Exponential backoff with jitter: ~2s, ~4s, ~8s, capped."""
    base = min(_BACKOFF_BASE_SECONDS * (2 ** attempt), _BACKOFF_MAX_SECONDS)
    return base + random.uniform(0, 1)


class GeminiClient:
    """
    complete_json(model, prompt) -> dict

    Sends `prompt` as the single content, with response_mime_type set to
    force JSON-only output. Parses the result with json.loads and raises a
    clear ValueError with a truncated preview of the raw output if Gemini
    ever returns something that isn't valid JSON.
    """

    def __init__(self, temperature: float = 0.1):
        self.temperature = temperature

    def _generate(self, api_key: str, model: str, prompt: str):
        client = _get_client(api_key)
        return client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=self.temperature,
                response_mime_type="application/json",
            ),
        )

    @staticmethod
    def _is_busy(exc: Exception) -> bool:
        text = str(exc)
        return any(marker in text for marker in _BUSY_MARKERS)

    @staticmethod
    def _is_quota(exc: Exception) -> bool:
        text = str(exc)
        return any(marker in text for marker in _QUOTA_MARKERS)

    @staticmethod
    def _is_daily_quota(exc: Exception) -> bool:
        text = str(exc)
        return any(marker in text for marker in _DAILY_QUOTA_MARKERS)

    @staticmethod
    def _retry_delay(exc: Exception) -> float:
        """How long Gemini asked us to wait, capped. Falls back to a default."""
        text = str(exc)
        for pattern in _RETRY_DELAY_PATTERNS:
            match = pattern.search(text)
            if match:
                try:
                    return min(float(match.group(1)) + 1, _MAX_RATE_WAIT_SECONDS)
                except ValueError:
                    pass
        return _DEFAULT_RATE_WAIT_SECONDS

    def complete_json(self, model: str, prompt: str) -> dict:
        models = [model]
        if model != FALLBACK_MODEL:
            models.append(FALLBACK_MODEL)

        keys = _get_api_keys()

        response = None
        last_exc: Exception | None = None
        last_was_quota = False

        for key_number, api_key in enumerate(keys, start=1):
            for current_model in models:
                for attempt in range(_ATTEMPTS_PER_MODEL):
                    is_last_attempt = attempt == _ATTEMPTS_PER_MODEL - 1
                    try:
                        response = self._generate(api_key, current_model, prompt)
                        break
                    except Exception as exc:  # noqa: BLE001
                        last_exc = exc

                        if self._is_quota(exc):
                            last_was_quota = True
                            if self._is_daily_quota(exc):
                                print(
                                    f"[gemini] key {key_number} / {current_model} "
                                    f"daily quota used up, skipping"
                                )
                                break  # waiting seconds won't fix a daily quota
                            # Per-minute limit: waiting does help.
                            if is_last_attempt:
                                print(
                                    f"[gemini] key {key_number} / {current_model} "
                                    f"still rate limited, skipping"
                                )
                                break
                            wait = self._retry_delay(exc)
                            print(
                                f"[gemini] key {key_number} / {current_model} rate "
                                f"limited, waiting {wait:.0f}s "
                                f"(attempt {attempt + 1}/{_ATTEMPTS_PER_MODEL})"
                            )
                            time.sleep(wait)
                            continue

                        if not self._is_busy(exc):
                            raise  # a real error (bad request, auth, ...): do not mask it

                        last_was_quota = False
                        print(
                            f"[gemini] key {key_number} / {current_model} busy "
                            f"(attempt {attempt + 1}/{_ATTEMPTS_PER_MODEL})"
                        )
                        if not is_last_attempt:
                            time.sleep(_backoff_seconds(attempt))

                if response is not None:
                    if key_number > 1 or current_model != model:
                        print(f"[gemini] used key {key_number} / {current_model}")
                    break
            if response is not None:
                break

        if response is None:
            if last_was_quota:
                # Deliberately worded without status codes so BaseAgent
                # does not treat it as transient and retry.
                raise RuntimeError(
                    "The AI service has reached its free usage limit for now. "
                    "Please try again in a few minutes (or after the daily reset)."
                )
            # Last failure was a busy server: re-raise it so BaseAgent retries.
            raise last_exc

        raw = response.text
        if not raw:
            raise ValueError("Gemini returned an empty response (it may have been blocked).")
        try:
            # strict=False lets raw line breaks/tabs inside strings through; Gemini
            # sometimes writes a real newline inside a multi-line resume value.
            return json.loads(raw, strict=False)
        except json.JSONDecodeError as e:
            preview = raw[:300] if raw else raw
            raise ValueError(
                f"Gemini did not return valid JSON: {e}\nRaw output preview:\n{preview}"
            )