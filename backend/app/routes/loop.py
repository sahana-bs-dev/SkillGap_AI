"""
POST /api/resume/improvement-loop

Runs the improvement loop (Rewrite -> re-Match -> repeat) for the logged-in
user and saves the best resume as a new version, so it shows up in the
version history next to normal rewrites.

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
from app.db.mongo_client import resume_versions_collection
from app.llm.gemini_client import GeminiClient
from app.llm.groq_client import GroqClient
from app.llm.schemas import AgentName, MatchingOutput, SkillGapItem
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


@router.post("/improvement-loop", response_model=LoopResponse)
def run_improvement_loop(payload: LoopRequest, current_user: dict = Depends(get_current_user)):
    if not payload.resume_text or not payload.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is empty")

    result = _controller.run(
        resume_text=payload.resume_text,
        jd_analysis=jd_from_matching(payload.matching_output),
        matching_output=payload.matching_output,
        gaps=payload.gaps,
        max_rounds=payload.max_rounds,
    )

    version_id, version_no = _save_best_as_version(str(current_user["_id"]), result)
    return LoopResponse(**result.model_dump(), final_version_id=version_id, final_version_no=version_no)