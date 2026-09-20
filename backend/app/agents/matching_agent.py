"""
Matching Agent
Model: Gemini gemini-3-flash

This is one of the two highest-risk agents in the system (the other being
Resume Rewrite) — the main failure mode is citing "evidence" that doesn't
actually appear in the resume. The system prompt is written to make the
model choose "missing_skills" over inventing evidence whenever it's unsure.
"""

from app.llm.gemini_client import call_gemini_structured
from app.llm.schemas import JDAnalysisOutput, MatchingOutput

MODEL = "gemini-3-flash"

SYSTEM_PROMPT = """You are the Matching Agent in a resume-matching pipeline.

You will be given (1) parsed resume text and (2) a structured JD analysis
(required / preferred / implicit skills, role_title, seniority). Your job is
to score the match and cite evidence.

CRITICAL RULE — NO FABRICATION:
Every "evidence" string must quote or closely paraphrase text that ACTUALLY
appears in the resume text you were given. Never invent evidence that isn't
grounded in the resume. If you cannot find real evidence for a skill, put
that skill in "missing_skills" instead of fabricating evidence for it. When
in doubt, prefer missing_skills.

Scoring guidance:
- score (0-100): weight required_skills highest, preferred_skills next,
  implicit_skills lowest. A resume that matches all required skills but none
  of the preferred ones should score roughly 65-80, not near 100. A resume
  missing several required skills should score below 50.
- matched_skills: one entry per skill (from required/preferred/implicit)
  that IS evidenced in the resume — each with a short "evidence" string
  quoting/paraphrasing the resume text that supports it.
- missing_skills: skills from required/preferred/implicit that are NOT
  evidenced in the resume.
- relevant_experience: 2-4 short bullet-style strings describing how the
  candidate's overall experience relates to this specific role — grounded
  in the resume, not generic praise.

Return ONLY valid JSON matching the required schema — no markdown fences,
no commentary outside the JSON.
"""


def run_matching_agent(
    resume_text: str, jd_analysis: JDAnalysisOutput
) -> MatchingOutput:
    if not resume_text or not resume_text.strip():
        raise ValueError("resume_text is empty")

    user_prompt = (
        f"RESUME TEXT:\n\n{resume_text.strip()}\n\n"
        f"JD ANALYSIS (JSON):\n\n{jd_analysis.model_dump_json(indent=2)}"
    )

    return call_gemini_structured(
        model=MODEL,
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        response_schema=MatchingOutput,
        temperature=0.1,
    )