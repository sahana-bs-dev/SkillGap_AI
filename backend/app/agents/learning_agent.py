"""
Learning Agent — Groq (openai/gpt-oss-120b).

Builds a Learn -> Practice -> Build plan per skill gap. Resource links
are constrained to the curated catalog (curated_resources.py) so the
model can never hallucinate a URL — only "build_project" is freely
generated, since that's meant to be a project idea, not a link.
"""

from __future__ import annotations

import json

from app.agents.base_agent import BaseAgent
from app.agents.curated_resources import get_candidates_for_skill
from app.llm.schemas import AgentName, LearningInput, LearningOutput

LEARNING_MODEL = "openai/gpt-oss-120b"


class LearningAgent(BaseAgent[LearningInput, LearningOutput]):
    name = AgentName.LEARNING
    output_schema = LearningOutput

    def build_prompt(self, input_data: LearningInput) -> str:
        gap_blocks = []
        for gap in input_data.gaps:
            candidates = get_candidates_for_skill(gap.skill)
            candidates_json = json.dumps(candidates, indent=2) if candidates else "{}"
            gap_blocks.append(
                f"""Skill: {gap.skill}
Priority: {gap.priority}
Suggested projects (from Skill Gap Agent): {gap.suggested_projects}
Candidate resources (choose ONLY from these — never invent a URL):
{candidates_json}"""
            )
        gaps_section = "\n\n".join(gap_blocks)

        return f"""
You are the Learning Agent in a resume-matching pipeline. For each skill
gap below, build a Learn -> Practice -> Build plan.

CRITICAL RULE — NO INVENTED LINKS:
For "learn_resources" and "practice_resources", you may ONLY select from
that skill's "Candidate resources" list. Each candidate is already a
{{"title": ..., "url": ...}} object — copy the title and url fields
exactly, do not alter, merge, or reformat them. If a skill's candidate
list is empty ({{}}), return an empty list for that skill's
learn_resources/practice_resources — do not invent a resource or URL to
fill the gap.

For "build_project": suggest ONE project realistically scoped for a
college student to complete in 1-3 weeks alongside coursework — small
and specific, not open-ended or production-scale. Draw on "Suggested
projects" above if it fits.

SKILL GAPS:
{gaps_section}

Return ONLY a JSON object with this exact shape:
{{
  "plan": [
    {{
      "skill": "...",
      "learn_resources": [{{"title": "...", "url": "..."}}, ...],
      "practice_resources": [{{"title": "...", "url": "..."}}, ...],
      "build_project": "..."
    }}
  ]
}}
""".strip()