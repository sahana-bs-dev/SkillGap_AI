"""
POST /api/resume/improvement-loop

Runs the improvement loop (Rewrite -> re-Match -> repeat) for the logged-in
user and saves the best resume as a new version, so it shows up in the
version history next to normal rewrites.

Every run is also recorded in loop_runs (for the History page), including
runs where the original resume was already the best and no new version was
saved.

The loop re-scores with the real JD analysis (required / preferred / implicit
skills) loaded from the jd_cache that /analyze/match fills, so round scores
match the Match report. If it cannot be found, it falls back to a flat skill
list rebuilt from the match output.

Request:  { resume_text, matching_output, gaps, max_rounds? }
Response: { iterations[{iteration, score, remaining_gaps, accepted, warnings}],
            finished, stop_reason, original_resume, final_resume,
            best_iteration, max_rounds, final_version_id, final_version_no }
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.agents.matching_agent import MATCHING_MODEL, MatchingAgent
from app.agents.resume_rewrite_agent import REWRITE_MODEL, ResumeRewriteAgent
from app.agents.skill_gap_agent import SKILL_GAP_MODEL, SkillGapAgent
from app.auth.jwt_handler import get_current_user
from app.db.mongo_client import (
    analyses_collection,
    loop_runs_collection,
    resume_versions_collection,
)
from app.llm.gemini_client import GeminiClient
from app.llm.groq_client import GroqClient
from app.llm.schemas import AgentName, JDAnalysisOutput, MatchingOutput, SkillGapItem
from app.orchestration.improvement_loop import (
    DEFAULT_MAX_ROUNDS,
    ImprovementLoopController,
    LoopResult,
    jd_from_matching,
)

router = APIRouter(prefix="/api/resume", tags=["improvement-loop"])

_groq_client = GroqClient()
_gemini_client = GeminiClient()

# Same agents/models the /analyze and /api/resume routes already use.
_registry = {
    AgentName.RESUME_REWRITE: ResumeRewriteAgent(llm_client=_gemini_client, model=REWRITE_MODEL),
    AgentName.MATCHING: MatchingAgent(llm_client=_groq_client, model=MATCHING_MODEL),
    AgentName.SKILL_GAP: SkillGapAgent(llm_client=_groq_client, model=SKILL_GAP_MODEL),
}
_controller = ImprovementLoopController(_registry)

# Same collection /analyze/match writes its cached JD analyses to.
_jd_cache = analyses_collection.database["jd_cache"]


class LoopRequest(BaseModel):
    resume_text: str
    matching_output: MatchingOutput
    gaps: list[SkillGapItem] = []
    max_rounds: int = Field(default=DEFAULT_MAX_ROUNDS, ge=1, le=5)


class LoopResponse(LoopResult):
    final_version_id: Optional[str] = None
    final_version_no: Optional[int] = None


def _save_best_as_version(user_id: str, result: LoopResult) -> tuple[Optional[str], Optional[int]]:
    """Store the loop's best resume in resume_versions. Never lets a DB problem
    throw away minutes of model work: on failure the loop result is still returned."""
    if result.best_iteration == 0:
        return None, None  # the original was already the best; nothing new to store
    try:
        version_no = resume_versions_collection.count_documents({"user_id": user_id}) + 1
        scores = " to ".join(str(i.score) for i in result.iterations if i.accepted)
        doc = {
            "user_id": user_id,
            "version_no": version_no,
            "parent_version_id": None,
            "original_text": result.original_resume,
            "rewritten_text": result.final_resume,
            "diff_summary": [
                f"Improvement loop: best result from round {result.best_iteration} (scores {scores}).",
                f"Stopped because: {result.stop_reason}",
            ],
            "warnings": [],
            "source": "improvement_loop",
            "loop_iterations": [i.model_dump() for i in result.iterations],
            "created_at": datetime.now(timezone.utc),
        }
        inserted = resume_versions_collection.insert_one(doc)
        return str(inserted.inserted_id), version_no
    except Exception as exc:  # noqa: BLE001
        print(f"[loop] could not save version: {exc}")
        return None, None


def _find_job(user_id: str, matching_output: MatchingOutput) -> tuple[Optional[str], Optional[str]]:
    """The loop request does not carry the job, so find it from the user's most
    recent saved analysis with the same match score and missing skills.
    Best effort: returns (None, None) when nothing matches."""
    try:
        doc = analyses_collection.find_one(
            {
                "user_id": user_id,
                "flow": "resume_jd",
                "match_score": matching_output.score,
                "missing_skills": matching_output.missing_skills,
            },
            sort=[("created_at", -1)],
        )
        if doc:
            return doc.get("jd_title"), doc.get("jd_fingerprint")
    except Exception as exc:  # noqa: BLE001
        print(f"[loop] could not look up the job: {exc}")
    return None, None


def _load_jd_analysis(jd_fingerprint: Optional[str], matching_output: MatchingOutput) -> JDAnalysisOutput:
    """Prefer the real cached JD analysis; fall back to a flat list from the match."""
    if jd_fingerprint:
        try:
            cached = _jd_cache.find_one({"_id": jd_fingerprint})
            if cached and cached.get("analysis"):
                return JDAnalysisOutput(**cached["analysis"])
        except Exception as exc:  # noqa: BLE001
            print(f"[loop] could not load cached JD analysis: {exc}")
    return jd_from_matching(matching_output)


def _record_loop_run(
    user_id: str,
    jd_title: Optional[str],
    jd_fingerprint: Optional[str],
    result: LoopResult,
    version_id: Optional[str],
    version_no: Optional[int],
) -> None:
    """One history record per loop run, whether or not a new version was saved."""
    try:
        loop_runs_collection.insert_one(
            {
                "user_id": user_id,
                "created_at": datetime.now(timezone.utc),
                "jd_title": jd_title,
                "jd_fingerprint": jd_fingerprint,
                "version_id": version_id,
                "version_no": version_no,
                "best_iteration": result.best_iteration,
                "stop_reason": result.stop_reason,
                "iterations": [i.model_dump() for i in result.iterations],
            }
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[loop] could not record loop run: {exc}")


@router.post("/improvement-loop", response_model=LoopResponse)
def run_improvement_loop(payload: LoopRequest, current_user: dict = Depends(get_current_user)):
    if not payload.resume_text or not payload.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is empty")

    user_id = str(current_user["_id"])

    # Find the job first so the loop can score with the real JD analysis.
    jd_title, jd_fingerprint = _find_job(user_id, payload.matching_output)
    jd_analysis = _load_jd_analysis(jd_fingerprint, payload.matching_output)

    result = _controller.run(
        resume_text=payload.resume_text,
        jd_analysis=jd_analysis,
        matching_output=payload.matching_output,
        gaps=payload.gaps,
        max_rounds=payload.max_rounds,
    )

    version_id, version_no = _save_best_as_version(user_id, result)
    _record_loop_run(user_id, jd_title, jd_fingerprint, result, version_id, version_no)
    return LoopResponse(**result.model_dump(), final_version_id=version_id, final_version_no=version_no)