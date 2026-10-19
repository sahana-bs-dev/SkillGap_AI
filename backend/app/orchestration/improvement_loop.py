"""
Agentic improvement loop controller (Phase 8).

One round = Resume Rewrite -> re-run Matching -> log the score -> decide.

What it guarantees:
  * Round 0 is the ORIGINAL resume's score, computed with the same code-based
    scoring as every later round, so rounds are always comparable.
  * Every rewritten resume is checked against the ORIGINAL resume (not the
    previous round) with the Rewrite Agent's own no-fabrication guard, so
    invented content cannot slowly drift in across rounds.
  * The final resume is the BEST-scoring clean round, never just the last one.
    If no round beats the original, the original is returned unchanged.
  * The Matching agent only decides which skills have evidence. The score is
    computed in code by apply_match_score().

Stopping rules (first one that is true wins):
  1. no gaps remain
  2. max rounds reached (capped by the Supervisor's safety cap)
  3. the score dropped              -> that round is discarded
  4. the round added content that is not in the original resume -> discarded
  5. the score gain is below MIN_SCORE_GAIN -> converged
  6. an agent call failed           -> keep the best result so far
"""

from __future__ import annotations

from typing import Optional

from app.agents.resume_rewrite_agent import ResumeRewriteAgent
from app.agents.supervisor import MAX_LOOP_ITERATIONS, SupervisorAgent
from app.llm.schemas import (
    AgentName,
    JDAnalysisOutput,
    LoopIteration,
    LoopState,
    MatchingInput,
    MatchingOutput,
    ResumeRewriteInput,
    SkillGapInput,
    SkillGapItem,
)
from app.orchestration.pipeline import AgentRegistry
from app.utils.match_scoring import apply_match_score

DEFAULT_MAX_ROUNDS = 3
MIN_SCORE_GAIN = 3  # a round that gains fewer points than this counts as converged


class LoopIterationDetail(LoopIteration):
    """LoopIteration + extras. The frontend only needs the first three fields."""

    accepted: bool = True            # False = round was discarded (score drop / fabrication)
    warnings: list[str] = []         # fabrication-guard findings against the original resume


class LoopResult(LoopState):
    """LoopState + the resume text the dashboard needs to show before/after."""

    iterations: list[LoopIterationDetail] = []
    original_resume: str = ""
    final_resume: str = ""
    best_iteration: int = 0          # 0 = the original resume was already the best
    max_rounds: int = DEFAULT_MAX_ROUNDS


def jd_from_matching(matching_output: MatchingOutput) -> JDAnalysisOutput:
    """
    Fallback only: rebuild a JD skill list from a Matching result (matched +
    missing skills) when the real JD analysis cannot be found in the cache.

    Every skill is treated as required here, so the tiers (required /
    preferred / implicit) are lost. The route prefers the cached JD analysis.
    """
    skills: list[str] = []
    for item in matching_output.matched_skills:
        if item.skill and item.skill not in skills:
            skills.append(item.skill)
    for skill in matching_output.missing_skills:
        if skill and skill not in skills:
            skills.append(skill)
    return JDAnalysisOutput(required_skills=skills)


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
        max_rounds: int = DEFAULT_MAX_ROUNDS,
    ) -> LoopResult:
        max_rounds = max(1, min(int(max_rounds), MAX_LOOP_ITERATIONS))

        # Score round 0 with the same code-based scoring as every later round.
        matching_output = apply_match_score(matching_output, jd_analysis)

        original_resume = resume_text
        original_matching = matching_output
        original_gaps = gaps

        result = LoopResult(
            original_resume=original_resume,
            final_resume=original_resume,
            max_rounds=max_rounds,
        )
        result.iterations.append(
            LoopIterationDetail(
                iteration=0,
                score=matching_output.score,
                remaining_gaps=list(matching_output.missing_skills),
            )
        )

        current_resume = original_resume
        current_matching = matching_output
        current_gaps = gaps

        best_score = matching_output.score
        best_resume = original_resume
        best_round = 0

        def finish(reason: str) -> LoopResult:
            result.finished = True
            result.stop_reason = (reason[:1].upper() + reason[1:]) if reason else reason
            result.final_resume = best_resume
            result.best_iteration = best_round
            return result

        if not current_matching.missing_skills:
            return finish("No gaps remain, so there is nothing left to improve.")

        for round_no in range(1, max_rounds + 1):
            # ---- 1. rewrite ----
            rewrite = self.registry[AgentName.RESUME_REWRITE].run(
                ResumeRewriteInput(
                    resume_text=current_resume,
                    matching_output=current_matching,
                    gaps=current_gaps,
                )
            )
            if not rewrite.success:
                return finish(f"Round {round_no}: resume rewrite failed ({rewrite.error}). Kept the best version so far.")
            new_resume = rewrite.data.rewritten_text

            # ---- 2. fabrication check against the ORIGINAL resume ----
            violations = ResumeRewriteAgent._find_violations(
                ResumeRewriteInput(
                    resume_text=original_resume,
                    matching_output=original_matching,
                    gaps=original_gaps,
                ),
                new_resume,
            )

            # ---- 3. re-match ----
            rematch = self.registry[AgentName.MATCHING].run(
                MatchingInput(resume_text=new_resume, jd_analysis=jd_analysis)
            )
            if not rematch.success:
                return finish(f"Round {round_no}: re-scoring failed ({rematch.error}). Kept the best version so far.")
            # The model only says which skills have evidence; the score is computed here.
            new_matching: MatchingOutput = apply_match_score(rematch.data, jd_analysis)

            previous_score = current_matching.score
            gain = new_matching.score - previous_score
            dropped = new_matching.score < previous_score
            accepted = not violations and not dropped

            result.iterations.append(
                LoopIterationDetail(
                    iteration=round_no,
                    score=new_matching.score,
                    remaining_gaps=list(new_matching.missing_skills),
                    accepted=accepted,
                    warnings=[f"Not found in your original resume: {v}" for v in violations],
                )
            )

            # ---- 4. decide ----
            if violations:
                return finish(
                    f"Round {round_no} added content that is not in your original resume "
                    f"({', '.join(violations[:3])}). That round was discarded and the best earlier version kept."
                )
            if dropped:
                return finish(
                    f"Score dropped in round {round_no} ({previous_score} to {new_matching.score}). "
                    "That round was discarded and the best earlier version kept."
                )

            current_resume = new_resume
            current_matching = new_matching
            if new_matching.score > best_score:
                best_score = new_matching.score
                best_resume = new_resume
                best_round = round_no

            keep_going, reason = self.supervisor.should_continue_loop(
                remaining_gaps=new_matching.missing_skills,
                iteration=round_no,
            )
            if not keep_going:
                return finish(reason or "Supervisor stopped the loop.")
            if gain < MIN_SCORE_GAIN:
                return finish(
                    f"Score improved by less than {MIN_SCORE_GAIN} points in round {round_no}; the loop converged."
                )
            if round_no >= max_rounds:
                return finish(f"Reached the limit of {max_rounds} round{'' if max_rounds == 1 else 's'}.")

            # ---- 5. repeat edge: Skill Gap re-enters with the new match ----
            gap_result = self.registry[AgentName.SKILL_GAP].run(SkillGapInput(matching_output=new_matching))
            if not gap_result.success:
                return finish(f"Round {round_no}: skill gap re-run failed ({gap_result.error}). Kept the best version so far.")
            current_gaps = gap_result.data.gaps

        return finish(f"Reached the limit of {max_rounds} round{'' if max_rounds == 1 else 's'}.")