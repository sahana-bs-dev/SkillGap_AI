"""
Matching Agent — Groq (openai/gpt-oss-20b).

Highest hallucination risk in the system after Resume Rewrite — the prompt
is written to make the model prefer "missing_skills" over inventing
evidence whenever it's unsure.

The model does NOT pick the score. It only decides, skill by skill, whether
the resume has real evidence. app.utils.match_scoring.apply_match_score then
rebuilds matched/missing from the JD lists and computes the score in code.
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

You will be given parsed resume text and a structured JD analysis. For EVERY
skill in required_skills, preferred_skills and implicit_skills, decide whether
the resume shows real evidence of it.

CRITICAL RULE — NO FABRICATION:
Every "evidence" string must quote or closely paraphrase text that ACTUALLY
appears in the resume text below. Never invent evidence. If you cannot find
real evidence for a skill, put that skill in "missing_skills" instead. When
in doubt, prefer missing_skills.

How to decide:
- Go through the JD skills one by one. Each JD skill must end up in exactly one
  place: matched_skills or missing_skills. Do not skip any and do not add
  skills that are not in the JD analysis.
- In both lists, copy the skill name EXACTLY as written in the JD analysis.
- A skill is matched if the resume names it, or names a clear equivalent
  (e.g. "Postgres" for "PostgreSQL"), in a project, job, internship or skills
  section.
- matched_skills: one entry per matched skill, each with a short "evidence"
  string grounded in the resume text.
- relevant_experience: 2-4 short strings on how the candidate's overall
  experience relates to this specific role, grounded in the resume.
- score: always return 0. The system calculates the real score from your
  matched and missing lists.

Return ONLY a JSON object with this exact shape:
{{
  "score": 0,
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