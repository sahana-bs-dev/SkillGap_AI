"""
Shared interface every specialist agent implements.

Each concrete agent (ATS, JD Analysis, Matching, Skill Gap, Learning,
Resume Rewrite) subclasses BaseAgent, plugging in its own prompt builder
and its own Pydantic output schema. This keeps every agent callable the
same way from the pipeline, regardless of which provider (Groq or Gemini)
or model it uses under the hood — a model/provider swap for one agent
never touches the orchestration code.

run() retries on transient provider failures (Gemini 503 UNAVAILABLE,
Groq/OpenAI-style 429 rate limits, or a Groq json_validate_failed with an
empty failed_generation — usually a reasoning model that burned its whole
token budget before emitting JSON) with exponential backoff + jitter.
Schema validation failures are NOT retried — those mean the model
produced parseable JSON that doesn't match the contract, and retrying
blindly won't fix a prompt/schema mismatch.
"""

from __future__ import annotations

import random
import re
import time
from abc import ABC, abstractmethod
from typing import Generic, TypeVar

from pydantic import BaseModel, ValidationError

from app.llm.schemas import AgentName, AgentResult

InputT = TypeVar("InputT", bound=BaseModel)
OutputT = TypeVar("OutputT", bound=BaseModel)

# Substrings that indicate a transient, worth-retrying provider failure
# rather than a permanent one (bad model name, auth failure, etc).
_TRANSIENT_MARKERS = ("503", "UNAVAILABLE", "429", "json_validate_failed", "rate_limit", "RESOURCE_EXHAUSTED")

# Quota-exhausted errors (429 / RESOURCE_EXHAUSTED) come back with a
# provider-suggested wait time, e.g. "retryDelay': '25s'" or
# "Please retry in 25.1s". A ~1-2s exponential backoff is pointless against
# a free-tier quota window that's actually 25-60s — parse and honor it
# instead of guessing.
_RETRY_DELAY_PATTERNS = (
    re.compile(r"retryDelay['\"]?\s*[:=]\s*['\"]?(\d+(?:\.\d+)?)s"),
    re.compile(r"retry in\s+(\d+(?:\.\d+)?)s"),
    re.compile(r"try again in\s+(\d+(?:\.\d+)?)s"),  # Groq's TPM/RPM rate-limit phrasing
)
_MAX_QUOTA_WAIT_SECONDS = 60.0  # don't block a request thread forever

_MAX_RETRIES = 2  # total attempts = _MAX_RETRIES + 1
_BASE_BACKOFF_SECONDS = 1.0


class BaseAgent(ABC, Generic[InputT, OutputT]):
    name: AgentName
    output_schema: type[OutputT]

    def __init__(self, llm_client, model: str):
        self.llm_client = llm_client
        self.model = model

    @abstractmethod
    def build_prompt(self, input_data: InputT) -> str:
        """Return the full prompt (system + instructions) for this agent."""

    def run(self, input_data: InputT) -> AgentResult[OutputT]:
        start = time.monotonic()
        last_exc: Exception | None = None

        for attempt in range(_MAX_RETRIES + 1):
            try:
                prompt = self.build_prompt(input_data)
                raw = self.llm_client.complete_json(model=self.model, prompt=prompt)
                parsed = self.output_schema.model_validate(raw)
                return AgentResult(
                    agent_name=self.name,
                    success=True,
                    data=parsed,
                    error=None,
                    latency_ms=self._elapsed_ms(start),
                )
            except ValidationError as exc:
                # Not transient — the model returned JSON that doesn't
                # match the schema. Retrying won't help; fail immediately.
                return AgentResult(
                    agent_name=self.name,
                    success=False,
                    data=None,
                    error=f"schema validation failed: {exc}",
                    latency_ms=self._elapsed_ms(start),
                )
            except Exception as exc:  # noqa: BLE001 - an agent must never raise into the pipeline
                last_exc = exc
                if self._is_transient(exc) and attempt < _MAX_RETRIES:
                    time.sleep(self._backoff_delay(attempt, exc))
                    continue
                break

        return AgentResult(
            agent_name=self.name,
            success=False,
            data=None,
            error=str(last_exc),
            latency_ms=self._elapsed_ms(start),
        )

    @staticmethod
    def _is_transient(exc: Exception) -> bool:
        text = str(exc)
        return any(marker in text for marker in _TRANSIENT_MARKERS)

    @staticmethod
    def _suggested_delay(exc: Exception) -> float | None:
        text = str(exc)
        for pattern in _RETRY_DELAY_PATTERNS:
            match = pattern.search(text)
            if match:
                return min(float(match.group(1)), _MAX_QUOTA_WAIT_SECONDS)
        return None

    @classmethod
    def _backoff_delay(cls, attempt: int, exc: Exception) -> float:
        # Quota errors (429/RESOURCE_EXHAUSTED) tell you exactly how long to
        # wait — honor that instead of guessing with exponential backoff.
        suggested = cls._suggested_delay(exc)
        if suggested is not None:
            return suggested + random.uniform(0, 0.5)
        # Otherwise (503/UNAVAILABLE, transient JSON failures): exponential
        # backoff with jitter — ~1s, ~2s, ~4s...
        return (_BASE_BACKOFF_SECONDS * (2 ** attempt)) + random.uniform(0, 0.5)

    @staticmethod
    def _elapsed_ms(start: float) -> int:
        return int((time.monotonic() - start) * 1000)