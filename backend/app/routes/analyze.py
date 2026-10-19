"""
/analyze/ats, /analyze/jd, /analyze/match routes.

Each of the three agents is constructed once at module load (stateless,
same pattern as Phase 4's ats_agent). Every route validates its required
text field(s) up front and returns 400 on empty input — matching the
Phase 4 /analyze/ats behavior — before ever calling the agent. Agent-side
failures (bad JSON, schema validation failure, rate limit, timeout) come
back from BaseAgent.run() as AgentResult(success=False, error=...) and are
turned into a 502 with the underlying error message, so a client-input
problem and a provider-side problem are always distinguishable.

Phase 9: /ats and /match now require login and save each successful run to
analyses_collection so the History and Compare pages have data.

ATS score: the LLM only reports issues. The final score is computed in code
by compute_ats_score() so it can't be invented by the model. Because that
calculation is deterministic and needs no LLM call, /match computes the same
score for its own resume, so every saved match record has an ATS score too.

Match score: the JD analysis is cached by jd_fingerprint (same JD -> same
skill list) and normalized in code. The Matching agent only decides which
skills have evidence; apply_match_score() computes the number.
"""

from __future__ import annotations

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.agents.learning_agent import LEARNING_MODEL, LearningAgent
from app.agents.skill_gap_agent import SKILL_GAP_MODEL, SkillGapAgent
from app.agents.ats_agent import ATS_MODEL, ATSAgent
from app.agents.jd_analysis_agent import JD_ANALYSIS_MODEL, JDAnalysisAgent
from app.agents.matching_agent import MATCHING_MODEL, MatchingAgent
from app.auth.jwt_handler import get_current_user
from app.db.mongo_client import analyses_collection
from app.llm.gemini_client import GeminiClient
from app.llm.groq_client import GroqClient
from app.llm.schemas import (
    ATSInput,
    ATSOutput,
    JDAnalysisInput,
    JDAnalysisOutput,
    MatchingInput,
    MatchingOutput,
    LearningInput,
    LearningOutput,
    SkillGapInput,
    SkillGapOutput,
)
from app.utils.ats_scoring import compute_ats_score
from app.utils.history_utils import derive_jd_title, text_fingerprint
from app.utils.match_scoring import normalize_jd_analysis, apply_match_score


router = APIRouter(prefix="/analyze", tags=["analyze"])

# One client instance per provider, reused across agents/requests.
_groq_client = GroqClient()
_gemini_client = GeminiClient()

_ats_agent = ATSAgent(llm_client=_groq_client, model=ATS_MODEL)
_jd_agent = JDAnalysisAgent(llm_client=_groq_client, model=JD_ANALYSIS_MODEL)
_matching_agent = MatchingAgent(llm_client=_groq_client, model=MATCHING_MODEL)

_skill_gap_agent = SkillGapAgent(llm_client=_groq_client, model=SKILL_GAP_MODEL)
_learning_agent = LearningAgent(llm_client=_groq_client, model=LEARNING_MODEL)

# Cached JD analyses, stored in the same database as analyses_collection.
_jd_cache = analyses_collection.database["jd_cache"]


class ATSRequest(BaseModel):
    resume_text: str


class JDAnalyzeRequest(BaseModel):
    jd_text: str


class MatchRequest(BaseModel):
    resume_text: str
    jd_text: str


def _save_analysis(doc: dict) -> None:
    """History must never break an analysis the user already waited for."""
    try:
        analyses_collection.insert_one({**doc, "created_at": datetime.now(timezone.utc)})
    except Exception as exc:  # noqa: BLE001
        print(f"[history] could not save analysis: {exc}")


def _get_jd_analysis(jd_text: str):
    """
    Return (normalized JDAnalysisOutput, error message or None).

    The same JD text always returns the same skill list: the first run is
    cached by fingerprint and reused afterwards. Cache problems never break
    the request.
    """
    fingerprint = text_fingerprint(jd_text)

    try:
        cached = _jd_cache.find_one({"_id": fingerprint})
        if cached and cached.get("analysis"):
            return JDAnalysisOutput(**cached["analysis"]), None
    except Exception as exc:  # noqa: BLE001
        print(f"[jd_cache] read failed: {exc}")

    result = _jd_agent.run(JDAnalysisInput(jd_text=jd_text))
    if not result.success:
        return None, result.error

    jd = normalize_jd_analysis(result.data)

    try:
        _jd_cache.replace_one(
            {"_id": fingerprint},
            {
                "_id": fingerprint,
                "analysis": jd.model_dump(),
                "created_at": datetime.now(timezone.utc),
            },
            upsert=True,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"[jd_cache] write failed: {exc}")

    return jd, None


@router.post("/ats", response_model=ATSOutput)
def analyze_ats(payload: ATSRequest, current_user: dict = Depends(get_current_user)):
    if not payload.resume_text or not payload.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is empty")

    result = _ats_agent.run(ATSInput(resume_text=payload.resume_text))
    if not result.success:
        raise HTTPException(status_code=502, detail=f"ATS analysis failed: {result.error}")

    # Ignore the model's own number; compute the score in code instead.
    data = result.data.model_copy(
        update={"score": compute_ats_score(payload.resume_text, result.data.issues)}
    )

    _save_analysis({
        "user_id": str(current_user["_id"]),
        "flow": "resume_only",
        "resume_hash": text_fingerprint(payload.resume_text, 16),
        "jd_title": None,
        "jd_fingerprint": None,
        "ats_score": data.score,
        "match_score": None,
        "matched_skills": [],
        "missing_skills": [],
    })
    return data


@router.post("/jd", response_model=JDAnalysisOutput)
def analyze_jd(payload: JDAnalyzeRequest):
    if not payload.jd_text or not payload.jd_text.strip():
        raise HTTPException(status_code=400, detail="jd_text is empty")

    jd, error = _get_jd_analysis(payload.jd_text)
    if jd is None:
        raise HTTPException(status_code=502, detail=f"JD analysis failed: {error}")
    return jd


@router.post("/match", response_model=MatchingOutput)
def analyze_match(payload: MatchRequest, current_user: dict = Depends(get_current_user)):
    if not payload.resume_text or not payload.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is empty")
    if not payload.jd_text or not payload.jd_text.strip():
        raise HTTPException(status_code=400, detail="jd_text is empty")

    jd, jd_error = _get_jd_analysis(payload.jd_text)
    if jd is None:
        raise HTTPException(status_code=502, detail=f"JD analysis failed: {jd_error}")

    match_result = _matching_agent.run(
        MatchingInput(resume_text=payload.resume_text, jd_analysis=jd)
    )
    if not match_result.success:
        raise HTTPException(status_code=502, detail=f"Matching failed: {match_result.error}")

    # The model only says which skills have evidence; the score is computed here.
    match = apply_match_score(match_result.data, jd)

    user_id = str(current_user["_id"])
    _save_analysis({
        "user_id": user_id,
        "flow": "resume_jd",
        "resume_hash": text_fingerprint(payload.resume_text, 16),
        "jd_title": derive_jd_title(payload.jd_text, jd.role_title),
        "jd_fingerprint": text_fingerprint(payload.jd_text),
        # Same code-based score the ATS page shows for this resume text.
        "ats_score": compute_ats_score(payload.resume_text, []),
        "match_score": match.score,
        "matched_skills": [m.skill for m in match.matched_skills],
        "missing_skills": match.missing_skills,
    })
    return match


@router.post("/skill-gap", response_model=SkillGapOutput)
def analyze_skill_gap(payload: SkillGapInput):
    result = _skill_gap_agent.run(payload)
    if not result.success:
        raise HTTPException(status_code=502, detail=f"Skill gap analysis failed: {result.error}")
    return result.data


@router.post("/learning", response_model=LearningOutput)
def analyze_learning(payload: LearningInput):
    result = _learning_agent.run(payload)
    if not result.success:
        raise HTTPException(status_code=502, detail=f"Learning plan generation failed: {result.error}")
    return result.data