"""
Thin wrapper around the Groq API so every agent that uses Groq goes through
one place. If a model or provider ever needs to change, this is the only
file that should have to.

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


def call_groq_json(
    model: str,
    system_prompt: str,
    user_prompt: str,
    temperature: float = 0.2,
) -> dict:
    """
    Calls a Groq chat model with JSON mode and returns the parsed dict.
    Raises ValueError if the model didn't return valid JSON (rare with
    response_format=json_object, but agents should still not trust the
    shape blindly — validate with the relevant Pydantic schema after this).
    """
    client = _get_client()

    response = client.chat.completions.create(
        model=model,
        temperature=temperature,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )

    raw = response.choices[0].message.content
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Groq did not return valid JSON: {e}\nRaw output:\n{raw}")