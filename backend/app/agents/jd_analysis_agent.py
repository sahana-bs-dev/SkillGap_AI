"""
JD Analysis Agent — Groq (llama-3.3-70b-versatile).

Extracts categorized skills and role metadata from a raw job description,
for the Matching Agent to consume next.
"""

from __future__ import annotations

from app.agents.base_agent import BaseAgent
from app.llm.schemas import AgentName, JDAnalysisInput, JDAnalysisOutput

JD_ANALYSIS_MODEL = "openai/gpt-oss-120b"


class JDAnalysisAgent(BaseAgent[JDAnalysisInput, JDAnalysisOutput]):
    name = AgentName.JD_ANALYSIS
    output_schema = JDAnalysisOutput

    def build_prompt(self, input_data: JDAnalysisInput) -> str:
        return f"""
You are the JD Analysis Agent in a resume-matching pipeline.

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
- If the JD is vague or short, empty lists are fine — do not pad with guesses.

Return ONLY a JSON object with this exact shape:
{{
  "role_title": "<string or null>",
  "seniority": "<string or null>",
  "required_skills": ["..."],
  "preferred_skills": ["..."],
  "implicit_skills": ["..."]
}}

JOB DESCRIPTION:
\"\"\"
{input_data.jd_text}
\"\"\"
""".strip()