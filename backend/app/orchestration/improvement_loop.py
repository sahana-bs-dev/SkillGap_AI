"""
Agentic improvement loop controller — re-runs Matching after each Resume
Rewrite, logs the score per iteration, and asks the Supervisor whether to
keep going. This is the dashed "repeat" edge in the roadmap diagram
(Remaining Gaps -> Skill Gap, mediated by the Supervisor).
"""

from __future__ import annotations

from typing import Optional

from app.agents.supervisor import SupervisorAgent
from app.llm.schemas import (
    AgentName,
    JDAnalysisOutput,
    LoopState,
    LoopIteration,
    MatchingInput,
    MatchingOutput,
    ResumeRewriteInput,
    SkillGapInput,
    SkillGapItem,
)
from app.orchestration.pipeline import AgentRegistry


class ImprovementLoopController:
    def __init__(self, registry: AgentRegistry, supervisor: Optional[SupervisorAgent] = None):
        self.registry = registry
        self.supervisor = supervisor or SupervisorAgent()

    def run(
        self,
        resume_text: str,
        jd_analysis: JDAnalysisOutput,
        matching_output: MatchingOutput,
        gaps: list[SkillGapItem],
    ) -> LoopState:
        state = LoopState()
        current_resume = resume_text
        current_gaps = gaps
        iteration = 0

        while True:
            iteration += 1

            rewrite_result = self.registry[AgentName.RESUME_REWRITE].run(
                ResumeRewriteInput(
                    resume_text=current_resume,
                    matching_output=matching_output,
                    gaps=current_gaps,
                )
            )
            if not rewrite_result.success:
                state.finished = True
                state.stop_reason = f"resume rewrite failed: {rewrite_result.error}"
                return state
            current_resume = rewrite_result.data.rewritten_text

            rematch_result = self.registry[AgentName.MATCHING].run(
                MatchingInput(resume_text=current_resume, jd_analysis=jd_analysis)
            )
            if not rematch_result.success:
                state.finished = True
                state.stop_reason = f"re-match failed: {rematch_result.error}"
                return state
            matching_output = rematch_result.data

            state.iterations.append(
                LoopIteration(
                    iteration=iteration,
                    score=matching_output.score,
                    remaining_gaps=matching_output.missing_skills,
                )
            )

            keep_going, stop_reason = self.supervisor.should_continue_loop(
                remaining_gaps=matching_output.missing_skills,
                iteration=iteration,
            )
            if not keep_going:
                state.finished = True
                state.stop_reason = stop_reason
                return state

            gap_result = self.registry[AgentName.SKILL_GAP].run(
                SkillGapInput(matching_output=matching_output)
            )
            if not gap_result.success:
                state.finished = True
                state.stop_reason = f"skill gap re-run failed: {gap_result.error}"
                return state
            current_gaps = gap_result.data.gaps