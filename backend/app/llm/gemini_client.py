"""
Thin wrapper around the Gemini API (google-genai SDK — NOT the deprecated
google-generativeai package) so every agent that uses Gemini goes through
one place, mirroring GroqClient's shape in groq_client.py.

Env var required: GEMINI_API_KEY
Install: pip install google-genai
"""

import json
import os

from google import genai
from google.genai import types

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set")
        _client = genai.Client(api_key=api_key)
    return _client


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

    def complete_json(self, model: str, prompt: str) -> dict:
        client = _get_client()

        response = client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=self.temperature,
                response_mime_type="application/json",
            ),
        )

        raw = response.text
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            preview = raw[:300] if raw else raw
            raise ValueError(
                f"Gemini did not return valid JSON: {e}\nRaw output preview:\n{preview}"
            )