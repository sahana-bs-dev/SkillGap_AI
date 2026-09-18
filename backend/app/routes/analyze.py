"""
POST /analyze/ats

Runs the ATS Agent on parsed resume text. This is what the Supervisor's
"resume-only" route calls (per app/agents/supervisor.py's decide_route).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.agents.ats_agent import ATSAgent, ATS_MODEL
from app.llm.groq_client import groq_client
from app.llm.schemas import ATSInput, ATSOutput

router = APIRouter(prefix="/analyze", tags=["analyze"])

# One shared agent instance — it's stateless (each .run() call is independent),
# so there's no need to construct a new one per request.
ats_agent = ATSAgent(llm_client=groq_client, model=ATS_MODEL)


@router.post("/ats", response_model=ATSOutput)
def analyze_ats(payload: ATSInput):
    if not payload.resume_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="resume_text is required.",
        )

    result = ats_agent.run(payload)

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"ATS agent failed: {result.error}",
        )

    return result.data