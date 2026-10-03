"""
Thin wrapper around the Gemini API (google-genai SDK — NOT the deprecated
google-generativeai package) so every agent that uses Gemini goes through
one place, mirroring GroqClient's shape in groq_client.py.

Env vars: GEMINI_API_KEY (required), GEMINI_API_KEY_2 (optional, backup key)
Install: pip install google-genai

- 503 / UNAVAILABLE (server busy): retried briefly, then next model.
- Daily quota used up (429): NOT retried; moves on to the next model,
  then the next API key.
- If every key/model failed, the error reflects the LAST failure type:
  quota message only if the last failures were quota, otherwise the
  original busy error (which BaseAgent knows how to retry).
"""

import json
import os
import time

from google import genai
from google.genai import types

FALLBACK_MODEL = "gemini-3.8-flash"
_KEY_ENV_NAMES = ("GEMINI_API_KEY", "GEMINI_API_KEY_2")
_BUSY_MARKERS = ("503", "UNAVAILABLE")
_QUOTA_MARKERS = ("429", "RESOURCE_EXHAUSTED")
_ATTEMPTS_PER_MODEL = 2
_WAIT_SECONDS = 3

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
                    try:
                        response = self._generate(api_key, current_model, prompt)
                        break
                    except Exception as exc:  # noqa: BLE001
                        last_exc = exc
                        if self._is_quota(exc):
                            last_was_quota = True
                            print(
                                f"[gemini] key {key_number} / {current_model} "
                                f"quota used up, skipping"
                            )
                            break  # waiting seconds won't fix a daily quota
                        if not self._is_busy(exc):
                            raise
                        last_was_quota = False
                        print(
                            f"[gemini] key {key_number} / {current_model} busy "
                            f"(attempt {attempt + 1}/{_ATTEMPTS_PER_MODEL})"
                        )
                        if attempt < _ATTEMPTS_PER_MODEL - 1:
                            time.sleep(_WAIT_SECONDS)
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
                    "Gemini free daily limit reached for all API keys. "
                    "Try again after the daily reset, or add another key."
                )
            # Last failure was a busy server: re-raise it so BaseAgent retries.
            raise last_exc

        raw = response.text
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            preview = raw[:300] if raw else raw
            raise ValueError(
                f"Gemini did not return valid JSON: {e}\nRaw output preview:\n{preview}"
            )