"""
Thin wrapper around the Gemini API (google-genai SDK — NOT the deprecated
google-generativeai package) so every agent that uses Gemini goes through
one place.

Env var required: GEMINI_API_KEY
Install: pip install google-genai
"""

import os
from typing import Type, TypeVar

from google import genai
from google.genai import types
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is not set")
        _client = genai.Client(api_key=api_key)
    return _client


def call_gemini_structured(
    model: str,
    system_prompt: str,
    user_prompt: str,
    response_schema: Type[T],
    temperature: float = 0.1,
) -> T:
    """
    Calls Gemini with a Pydantic response_schema and returns an already-
    validated instance of that schema (response.parsed does the parsing +
    validation for us — no manual json.loads needed).
    """
    client = _get_client()

    response = client.models.generate_content(
        model=model,
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=temperature,
            response_mime_type="application/json",
            response_schema=response_schema,
        ),
    )

    parsed = response.parsed
    if parsed is None:
        # Fallback: schema-constrained generation still occasionally returns
        # text that needs a manual parse — surface it clearly instead of
        # silently returning None.
        raise ValueError(
            f"Gemini response could not be parsed into {response_schema.__name__}. "
            f"Raw text:\n{response.text}"
        )
    return parsed