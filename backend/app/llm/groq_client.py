"""
Thin wrapper around the Groq API so every agent that uses Groq goes through
one place. If a model or provider ever needs to change, this is the only
file that should have to import the groq SDK.

Env var required: GROQ_API_KEY
Install: pip install groq
"""

import json
import os

from groq import Groq

_client: Groq | None = None


def _get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set")
        _client = Groq(api_key=api_key)
    return _client


class GroqClient:
    """
    complete_json(model, prompt) -> dict

    Sends `prompt` as the user message alongside a system message that
    forces strict JSON-only output (no markdown fences, no commentary),
    with response_format={"type": "json_object"} as a second layer of
    enforcement. Parses the result with json.loads and raises a clear
    ValueError with a truncated preview of the raw output if Groq ever
    returns something that isn't valid JSON.
    """

    _JSON_ONLY_SYSTEM_PROMPT = (
        "You must respond with valid JSON only. No markdown code fences, "
        "no commentary, no explanation before or after — just the JSON object."
    )

    def __init__(self, temperature: float = 0.2):
        self.temperature = temperature

    def complete_json(self, model: str, prompt: str) -> dict:
        client = _get_client()

        response = client.chat.completions.create(
            model=model,
            temperature=self.temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": self._JSON_ONLY_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        )

        raw = response.choices[0].message.content
        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            preview = raw[:300] if raw else raw
            raise ValueError(
                f"Groq did not return valid JSON: {e}\nRaw output preview:\n{preview}"
            )