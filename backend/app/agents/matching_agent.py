"""
Matching Agent — Gemini (gemini-3-flash).

Highest hallucination risk in the system after Resume Rewrite — the prompt
is written to make the model prefer "missing_skills" over inventing
evidence whenever it's unsure.
"""

from __future__ import annotations

from app.agents.base_agent import BaseAgent
from app.llm.schemas import AgentName, MatchingInput, MatchingOutput

MATCHING_MODEL = "openai/gpt-oss-20b"


class MatchingAgent(BaseAgent[MatchingInput, MatchingOutput]):
    name = AgentName.MATCHING
    output_schema = MatchingOutput

    def build_prompt(self, input_data: MatchingInput) -> str:
        jd_json = input_data.jd_analysis.model_dump_json(indent=2)

        return f"""
You are the Matching Agent in a resume-matching pipeline.

You will be given parsed resume text and a structured JD analysis. Score
the match and cite evidence.

CRITICAL RULE — NO FABRICATION:
Every "evidence" string must quote or closely paraphrase text that ACTUALLY
appears in the resume text below. Never invent evidence. If you cannot find
real evidence for a skill, put that skill in "missing_skills" instead. When
in doubt, prefer missing_skills.

Scoring guidance:
- score (0-100): weight required_skills highest, preferred_skills next,
  implicit_skills lowest. Matching all required skills but none of the
  preferred ones should score roughly 65-80, not near 100. Missing several
  required skills should score below 50.
- matched_skills: one entry per matched skill, each with a short "evidence"
  string grounded in the resume text.
- missing_skills: skills with no real evidence in the resume.
- relevant_experience: 2-4 short strings on how the candidate's overall
  experience relates to this specific role, grounded in the resume.

Return ONLY a JSON object with this exact shape:
{{
  "score": <integer 0-100>,
  "matched_skills": [{{"skill": "...", "evidence": "..."}}],
  "missing_skills": ["..."],
  "relevant_experience": ["..."]
}}

RESUME TEXT:
\"\"\"
{input_data.resume_text}
\"\"\"

JD ANALYSIS:
{jd_json}
""".strip()