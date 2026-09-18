"""
Shared interface every specialist agent implements.

Each concrete agent (ATS, JD Analysis, Matching, Skill Gap, Learning,
Resume Rewrite) subclasses BaseAgent, plugging in its own prompt builder
and its own Pydantic output schema. This keeps every agent callable the
same way from the pipeline, regardless of which provider (Groq or Gemini)
or model it uses under the hood — a model/provider swap for one agent
never touches the orchestration code.
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from typing import Generic, TypeVar

from pydantic import BaseModel, ValidationError

from app.llm.schemas import AgentName, AgentResult

InputT = TypeVar("InputT", bound=BaseModel)
OutputT = TypeVar("OutputT", bound=BaseModel)


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
            return AgentResult(
                agent_name=self.name,
                success=False,
                data=None,
                error=f"schema validation failed: {exc}",
                latency_ms=self._elapsed_ms(start),
            )
        except Exception as exc:  # noqa: BLE001 - an agent must never raise into the pipeline
            return AgentResult(
                agent_name=self.name,
                success=False,
                data=None,
                error=str(exc),
                latency_ms=self._elapsed_ms(start),
            )

    @staticmethod
    def _elapsed_ms(start: float) -> int:
        return int((time.monotonic() - start) * 1000)