"""
Orchestration: takes the Supervisor's route decision and chains the agent
calls for the intake pass, feeding one agent's output into the next
agent's input.

Agents are looked up by name from a registry the caller builds (real
agents in main.py, stub agents in tests). This file never imports a
concrete agent class, so swapping an agent's implementation later never
touches it.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel

from app.agents.base_agent import BaseAgent
from app.agents.supervisor import SupervisorAgent
from app.llm.schemas import (
    AgentName,
    AgentResult,
    ATSInput,
    JDAnalysisInput,
    JDAnalysisOutput,
    LearningInput,
    MatchingInput,
    MatchingOutput,
    RouteType,
    SkillGapInput,
    SkillGapOutput,
)

AgentRegistry = dict[AgentName, BaseAgent]


class PipelineReport(BaseModel):
    route: RouteType
    results: dict[AgentName, AgentResult] = {}
    failed_at: Optional[AgentName] = None

    model_config = {"arbitrary_types_allowed": True}


class PipelineOrchestrator:
    def __init__(self, registry: AgentRegistry, supervisor: Optional[SupervisorAgent] = None):
        self.registry = registry
        self.supervisor = supervisor or SupervisorAgent()

    def run_intake(self, resume_text: str, jd_text: Optional[str]) -> PipelineReport:
        """Runs the first pass: resume-only (ATS) or resume+JD (full analysis)."""
        route = self.supervisor.decide_route(jd_text)
        report = PipelineReport(route=route)

        if route is RouteType.RESUME_ONLY:
            result = self._call(AgentName.ATS, ATSInput(resume_text=resume_text))
            report.results[AgentName.ATS] = result
            if not result.success:
                report.failed_at = AgentName.ATS
            return report

        # RESUME_AND_JD: JD Analysis -> Matching -> Skill Gap -> Learning
        jd_result = self._call(AgentName.JD_ANALYSIS, JDAnalysisInput(jd_text=jd_text or ""))
        report.results[AgentName.JD_ANALYSIS] = jd_result
        if not jd_result.success:
            report.failed_at = AgentName.JD_ANALYSIS
            return report

        jd_output: JDAnalysisOutput = jd_result.data
        match_result = self._call(
            AgentName.MATCHING, MatchingInput(resume_text=resume_text, jd_analysis=jd_output)
        )
        report.results[AgentName.MATCHING] = match_result
        if not match_result.success:
            report.failed_at = AgentName.MATCHING
            return report

        match_output: MatchingOutput = match_result.data
        gap_result = self._call(AgentName.SKILL_GAP, SkillGapInput(matching_output=match_output))
        report.results[AgentName.SKILL_GAP] = gap_result
        if not gap_result.success:
            report.failed_at = AgentName.SKILL_GAP
            return report

        gap_output: SkillGapOutput = gap_result.data
        learn_result = self._call(AgentName.LEARNING, LearningInput(gaps=gap_output.gaps))
        report.results[AgentName.LEARNING] = learn_result
        if not learn_result.success:
            report.failed_at = AgentName.LEARNING

        return report

    def _call(self, agent_name: AgentName, input_data) -> AgentResult:
        agent = self.registry.get(agent_name)
        if agent is None:
            return AgentResult(
                agent_name=agent_name, success=False, error=f"no agent registered for {agent_name}"
            )
        return agent.run(input_data)