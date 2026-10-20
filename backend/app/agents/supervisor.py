"""
Supervisor Agent — pure routing logic, no LLM call of its own.

It only answers one question: on intake, is this resume-only or resume+JD?

Everything else (actually calling agents, chaining their outputs) lives in
app/orchestration/ — the Supervisor decides, the orchestrator does.
"""

from __future__ import annotations

from typing import Optional

from app.llm.schemas import AgentName, PipelinePlan, RouteType


class SupervisorAgent:
    name = AgentName.SUPERVISOR

    def decide_route(self, jd_text: Optional[str]) -> RouteType:
        """Resume only -> ATS. Resume + JD -> the full matching pipeline."""
        has_jd = bool(jd_text and jd_text.strip())
        return RouteType.RESUME_AND_JD if has_jd else RouteType.RESUME_ONLY

    def build_pipeline(self, route: RouteType) -> PipelinePlan:
        if route is RouteType.RESUME_ONLY:
            steps = [AgentName.ATS]
        else:
            steps = [
                AgentName.JD_ANALYSIS,
                AgentName.MATCHING,
                AgentName.SKILL_GAP,
                AgentName.LEARNING,
            ]
        return PipelinePlan(route=route, steps=steps)