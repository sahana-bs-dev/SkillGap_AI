"""
Supervisor Agent — pure routing logic, no LLM call of its own.

It only ever answers three questions (from the roadmap's loop diagram):
  1. On intake: resume-only or resume+JD?
  2. After an Improved Score: should we loop back to Skill Gap?
  3. When should the loop stop?

Everything else (actually calling agents, chaining their outputs) lives in
app/orchestration/ — the Supervisor decides, the orchestrator does.
"""

from __future__ import annotations

from typing import Optional

from app.llm.schemas import AgentName, PipelinePlan, RouteType

MAX_LOOP_ITERATIONS = 5   # safety cap so a bug in the loop can't run forever


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

    def should_continue_loop(
        self,
        remaining_gaps: list[str],
        iteration: int,
        student_ended_session: bool = False,
    ) -> tuple[bool, Optional[str]]:
        """
        Called after an Improved Score is logged. Returns (continue?, stop_reason);
        stop_reason is None while the loop should keep going.
        """
        if student_ended_session:
            return False, "student ended session"
        if not remaining_gaps:
            return False, "no remaining gaps"
        if iteration >= MAX_LOOP_ITERATIONS:
            return False, f"hit safety cap of {MAX_LOOP_ITERATIONS} iterations"
        return True, None

    def next_loop_step(self) -> AgentName:
        """The repeat edge always re-enters at Skill Gap (per the roadmap diagram)."""
        return AgentName.SKILL_GAP