"""
Thin wrapper around the Groq API.

Every agent talks to this through BaseAgent.llm_client — nobody imports
the groq SDK directly outside this file. That's the "one-file change"
isolation the roadmap calls for: swapping models/providers later never
touches agent code.
"""

from __future__ import annotations

import json
import time

from groq import Groq, BadRequestError

from app.config import GROQ_API_KEY

_client = Groq(api_key=GROQ_API_KEY)

# Groq's JSON-mode enforcement occasionally fails generation on a single
# request (empty/invalid output that doesn't satisfy response_format)
# even with correct input — observed in testing on openai/gpt-oss-20b,
# resolved by simply retrying the same request. This is NOT a rate-limit
# case (that's a 429 with type 'rate_limit_exceeded', raised separately
# below without retrying) — it's Groq's 400 json_validate_failed error.
MAX_JSON_RETRIES = 2
RETRY_BACKOFF_SECONDS = 1.5


class GroqClient:
    """Implements the complete_json(model, prompt) contract BaseAgent expects."""

    def complete_json(self, model: str, prompt: str) -> dict:
        last_error: Exception | None = None

        for attempt in range(1, MAX_JSON_RETRIES + 2):  # e.g. 2 retries -> 3 total attempts
            try:
                response = _client.chat.completions.create(
                    model=model,
                    messages=[
                        {
                            "role": "system",
                            "content": (
                                "You are a precise JSON-generating assistant. "
                                "Respond with ONLY a single valid JSON object — "
                                "no markdown fences, no commentary, no preamble."
                            ),
                        },
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.2,
                )

                raw = response.choices[0].message.content

                try:
                    return json.loads(raw)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"Groq returned non-JSON output: {raw[:300]}") from exc

            except BadRequestError as exc:
                # Only retry Groq's own json_validate_failed generation
                # failures — anything else (bad request shape, invalid
                # model name, etc.) should fail immediately, not retry.
                is_json_validate_failure = (
                    getattr(exc, "body", None)
                    and isinstance(exc.body, dict)
                    and exc.body.get("error", {}).get("code") == "json_validate_failed"
                )
                if not is_json_validate_failure:
                    raise

                last_error = exc
                if attempt <= MAX_JSON_RETRIES:
                    time.sleep(RETRY_BACKOFF_SECONDS * attempt)  # small backoff, not instant hammering
                    continue
                raise ValueError(
                    f"Groq failed JSON validation after {attempt} attempts: {exc}"
                ) from exc

            except ValueError:
                # Our own json.JSONDecodeError-wrapping ValueError from above —
                # also worth a retry since it's the same class of transient
                # generation failure, just caught client-side instead of by Groq.
                last_error = last_error or ValueError("non-JSON output")
                if attempt <= MAX_JSON_RETRIES:
                    time.sleep(RETRY_BACKOFF_SECONDS * attempt)
                    continue
                raise

        # Unreachable, but keeps type-checkers happy.
        raise last_error or RuntimeError("Groq request failed for an unknown reason")


groq_client = GroqClient()