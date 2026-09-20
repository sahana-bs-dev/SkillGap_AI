"""
/analyze/jd and /analyze/match routes.

NOTE: if you already have app/routes/analyze.py from the ATS Agent (Phase 4),
add the router below to that file instead of replacing it — just append the
two new request models and two new endpoints, and keep the existing
`router = APIRouter(...)` line.

If Phase 3's orchestration/pipeline.py already defines how the Supervisor
chains agents, prefer calling into that instead of calling the agents
directly here — this file calls them directly so Phase 5 is testable on its
own before it's wired into the Supervisor.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.jd_analysis_agent import run_jd_analysis_agent
from app.agents.matching_agent import run_matching_agent
from app.llm.schemas import JDAnalysisOutput, MatchingOutput

router = APIRouter(prefix="/analyze", tags=["analyze"])


class JDAnalyzeRequest(BaseModel):
    jd_text: str


class MatchRequest(BaseModel):
    resume_text: str
    jd_text: str


@router.post("/jd", response_model=JDAnalysisOutput)
def analyze_jd(payload: JDAnalyzeRequest):
    try:
        return run_jd_analysis_agent(payload.jd_text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"JD analysis failed: {e}")


@router.post("/match", response_model=MatchingOutput)
def analyze_match(payload: MatchRequest):
    try:
        jd_analysis = run_jd_analysis_agent(payload.jd_text)
        return run_matching_agent(payload.resume_text, jd_analysis)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Matching failed: {e}")