"""
JD Analysis Agent
Model: Groq llama-3.3-70b-versatile

Takes a raw job description and extracts structured, categorized skills plus
role metadata, for the Matching Agent to consume next.
"""

from app.llm.groq_client import call_groq_json
from app.llm.schemas import JDAnalysisOutput

MODEL = "llama-3.3-70b-versatile"

SYSTEM_PROMPT = """You are the JD Analysis Agent in a resume-matching pipeline.

Given a raw job description, extract:
- role_title: the job title being advertised (null if not stated)
- seniority: the seniority level implied by the JD, e.g. "intern",
  "entry-level", "mid-level", "senior" (null if genuinely unclear)
- required_skills: skills explicitly stated as required / must-have
- preferred_skills: skills explicitly stated as preferred / nice-to-have / bonus
- implicit_skills: skills strongly implied by the responsibilities but never
  named directly (e.g. "build and consume REST APIs" implies "API design";
  "work in an Agile team" implies "Agile/Scrum")

Rules:
- Do not invent skills that have no basis in the text.
- Keep each skill as a short canonical name (e.g. "React", not "experience
  building applications with the React.js framework").
- Deduplicate across the three skill lists — a given skill should appear in
  exactly one of required_skills / preferred_skills / implicit_skills.
- If the JD is vague or very short, it's fine for a list to be empty — do
  not pad it with guesses.
- Return ONLY valid JSON matching this schema, nothing else, no markdown
  fences, no commentary:
{
  "role_title": string | null,
  "seniority": string | null,
  "required_skills": [string],
  "preferred_skills": [string],
  "implicit_skills": [string]
}
"""


def run_jd_analysis_agent(jd_text: str) -> JDAnalysisOutput:
    if not jd_text or not jd_text.strip():
        raise ValueError("jd_text is empty")

    raw = call_groq_json(
        model=MODEL,
        system_prompt=SYSTEM_PROMPT,
        user_prompt=f"JOB DESCRIPTION:\n\n{jd_text.strip()}",
        temperature=0.2,
    )

    return JDAnalysisOutput(**raw)