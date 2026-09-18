"""
Phase 3 smoke tests: Supervisor routing + orchestration chaining.

Stub agents just echo back a fixed, schema-valid output — no real LLM
calls — so this checks the wiring, not the AI. Run with:
    python -m pytest tests/ -v
or just:
    python tests/test_phase3_routing.py
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.agents.base_agent import BaseAgent
from app.agents.supervisor import SupervisorAgent
from app.llm.schemas import (
    AgentName,
    AgentResult,
    ATSOutput,
    JDAnalysisOutput,
    LearningOutput,
    MatchedSkill,
    MatchingOutput,
    RouteType,
    SkillGapItem,
    SkillGapOutput,
)
from app.orchestration.pipeline import PipelineOrchestrator


class StubAgent(BaseAgent):
    """Bypasses the real run() entirely — just hands back a fixed result."""

    def __init__(self, name, fixed_output):
        self.name = name
        self.output_schema = type(fixed_output)
        self._fixed_output = fixed_output

    def build_prompt(self, input_data):
        return ""  # unused — run() is overridden below

    def run(self, input_data):
        return AgentResult(agent_name=self.name, success=True, data=self._fixed_output)


def make_registry():
    return {
        AgentName.ATS: StubAgent(AgentName.ATS, ATSOutput(score=70, issues=[], suggestions=[])),
        AgentName.JD_ANALYSIS: StubAgent(
            AgentName.JD_ANALYSIS,
            JDAnalysisOutput(role_title="Frontend Engineer", required_skills=["React", "TypeScript"]),
        ),
        AgentName.MATCHING: StubAgent(
            AgentName.MATCHING,
            MatchingOutput(
                score=64,
                matched_skills=[MatchedSkill(skill="React", evidence="Built X in React")],
                missing_skills=["GraphQL"],
            ),
        ),
        AgentName.SKILL_GAP: StubAgent(
            AgentName.SKILL_GAP,
            SkillGapOutput(gaps=[SkillGapItem(skill="GraphQL", priority="high")]),
        ),
        AgentName.LEARNING: StubAgent(AgentName.LEARNING, LearningOutput(plan=[])),
    }


def test_resume_only_route():
    sup = SupervisorAgent()
    assert sup.decide_route(jd_text=None) is RouteType.RESUME_ONLY
    assert sup.decide_route(jd_text="   ") is RouteType.RESUME_ONLY


def test_resume_and_jd_route():
    sup = SupervisorAgent()
    assert sup.decide_route(jd_text="We need a React dev") is RouteType.RESUME_AND_JD


def test_pipeline_resume_only():
    orchestrator = PipelineOrchestrator(make_registry())
    report = orchestrator.run_intake(resume_text="my resume", jd_text=None)
    assert report.route is RouteType.RESUME_ONLY
    assert AgentName.ATS in report.results
    assert report.failed_at is None


def test_pipeline_resume_and_jd_chains_outputs():
    orchestrator = PipelineOrchestrator(make_registry())
    report = orchestrator.run_intake(resume_text="my resume", jd_text="React role")
    assert report.route is RouteType.RESUME_AND_JD
    assert list(report.results.keys()) == [
        AgentName.JD_ANALYSIS,
        AgentName.MATCHING,
        AgentName.SKILL_GAP,
        AgentName.LEARNING,
    ]
    assert report.failed_at is None


def test_loop_stop_conditions():
    sup = SupervisorAgent()

    keep_going, reason = sup.should_continue_loop(remaining_gaps=[], iteration=1)
    assert keep_going is False and reason == "no remaining gaps"

    keep_going, reason = sup.should_continue_loop(remaining_gaps=["GraphQL"], iteration=1)
    assert keep_going is True and reason is None

    keep_going, reason = sup.should_continue_loop(remaining_gaps=["GraphQL"], iteration=5)
    assert keep_going is False and "safety cap" in reason


if __name__ == "__main__":
    test_resume_only_route()
    test_resume_and_jd_route()
    test_pipeline_resume_only()
    test_pipeline_resume_and_jd_chains_outputs()
    test_loop_stop_conditions()
    print("All Phase 3 routing/orchestration smoke tests passed.")