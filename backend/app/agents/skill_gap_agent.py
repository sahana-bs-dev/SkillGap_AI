"""
Skill Gap Agent — Groq (openai/gpt-oss-120b).

NOTE: the roadmap originally specified llama-3.3-70b-versatile, but Groq
retired that model on Aug 16, 2026 (same issue hit in Phase 5's JD
Analysis Agent). Using the same replacement model here from the start.
"""

from __future__ import annotations

from app.agents.base_agent import BaseAgent
from app.llm.schemas import AgentName, SkillGapInput, SkillGapOutput

SKILL_GAP_MODEL = "openai/gpt-oss-120b"


class SkillGapAgent(BaseAgent[SkillGapInput, SkillGapOutput]):
    name = AgentName.SKILL_GAP
    output_schema = SkillGapOutput

    def build_prompt(self, input_data: SkillGapInput) -> str:
        matching_json = input_data.matching_output.model_dump_json(indent=2)

        return f"""
You are the Skill Gap Agent in a resume-matching pipeline. You are given
the Matching Agent's output (score, matched skills, missing skills,
relevant experience) for one resume/JD pair.

TASK:
For each entry in "missing_skills", produce one gap item with:
- "skill": copy the skill name exactly as given.
- "priority": "high", "medium", or "low" — weight this by how central
  the skill likely is to the role's core responsibilities, not just by
  how many skills happen to be missing overall.
- "suggested_projects": 1-3 SHORT project ideas that let a college
  student demonstrate this specific skill. Every idea must be
  realistically scoped for a student to build in a few weeks alongside
  coursework — small and concrete (e.g. "a REST API with JWT auth for a
  todo app"), never open-ended or production-scale.

Do not invent skills that aren't listed in "missing_skills". If
"missing_skills" is empty, return an empty "gaps" list.

MATCHING AGENT OUTPUT:
{matching_json}

Return ONLY a JSON object with this exact shape:
{{
  "gaps": [
    {{"skill": "...", "priority": "high|medium|low", "suggested_projects": ["...", "..."]}}
  ]
}}
""".strip()