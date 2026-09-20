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
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.ats_agent import ATS_MODEL, ATSAgent
from app.agents.jd_analysis_agent import JD_ANALYSIS_MODEL, JDAnalysisAgent
from app.agents.matching_agent import MATCHING_MODEL, MatchingAgent
from app.llm.gemini_client import GeminiClient
from app.llm.groq_client import GroqClient
from app.llm.schemas import (
    ATSInput,
    ATSOutput,
    JDAnalysisInput,
    JDAnalysisOutput,
    MatchingInput,
    MatchingOutput,
)

router = APIRouter(prefix="/analyze", tags=["analyze"])

# One client instance per provider, reused across agents/requests.
_groq_client = GroqClient()
_gemini_client = GeminiClient()

_ats_agent = ATSAgent(llm_client=_groq_client, model=ATS_MODEL)
_jd_agent = JDAnalysisAgent(llm_client=_groq_client, model=JD_ANALYSIS_MODEL)
_matching_agent = MatchingAgent(llm_client=_groq_client, model=MATCHING_MODEL)


class ATSRequest(BaseModel):
    resume_text: str


class JDAnalyzeRequest(BaseModel):
    jd_text: str


class MatchRequest(BaseModel):
    resume_text: str
    jd_text: str


@router.post("/ats", response_model=ATSOutput)
def analyze_ats(payload: ATSRequest):
    if not payload.resume_text or not payload.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is empty")

    result = _ats_agent.run(ATSInput(resume_text=payload.resume_text))
    if not result.success:
        raise HTTPException(status_code=502, detail=f"ATS analysis failed: {result.error}")
    return result.data


@router.post("/jd", response_model=JDAnalysisOutput)
def analyze_jd(payload: JDAnalyzeRequest):
    if not payload.jd_text or not payload.jd_text.strip():
        raise HTTPException(status_code=400, detail="jd_text is empty")

    result = _jd_agent.run(JDAnalysisInput(jd_text=payload.jd_text))
    if not result.success:
        raise HTTPException(status_code=502, detail=f"JD analysis failed: {result.error}")
    return result.data


@router.post("/match", response_model=MatchingOutput)
def analyze_match(payload: MatchRequest):
    if not payload.resume_text or not payload.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is empty")
    if not payload.jd_text or not payload.jd_text.strip():
        raise HTTPException(status_code=400, detail="jd_text is empty")

    jd_result = _jd_agent.run(JDAnalysisInput(jd_text=payload.jd_text))
    if not jd_result.success:
        raise HTTPException(status_code=502, detail=f"JD analysis failed: {jd_result.error}")

    match_result = _matching_agent.run(
        MatchingInput(resume_text=payload.resume_text, jd_analysis=jd_result.data)
    )
    if not match_result.success:
        raise HTTPException(status_code=502, detail=f"Matching failed: {match_result.error}")
    return match_result.data