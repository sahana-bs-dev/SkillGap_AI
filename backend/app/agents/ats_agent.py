"""
ATS Agent — Groq (llama-3.1-8b-instant).

Checks a resume's plain-text for the kind of formatting/parsing issues
that trip up real ATS software (tables, columns, non-standard section
headers, missing standard sections, odd characters left over from PDF
extraction, etc.) and returns a score + structured issue list.

This agent never sees a job description — it only judges the resume in
isolation. That's what makes it usable on the "resume-only" route.
"""

from __future__ import annotations

from app.agents.base_agent import BaseAgent
from app.llm.schemas import AgentName, ATSInput, ATSOutput

ATS_MODEL = "openai/gpt-oss-20b"


class ATSAgent(BaseAgent[ATSInput, ATSOutput]):
    name = AgentName.ATS
    output_schema = ATSOutput

    def build_prompt(self, input_data: ATSInput) -> str:
        return f"""
You are an ATS (Applicant Tracking System) formatting checker.

You will be given the PLAIN TEXT extracted from a resume (already run
through a PDF/DOCX text extractor). Your job is to judge how well this
resume would survive being parsed by real ATS software, based only on
what's visible in this extracted text.

Look for signs of:
- Tables or multi-column layouts (text that reads out of order, or
  fragments that look interleaved from side-by-side columns)
- Missing standard sections (no clear Experience, Education, or Skills
  section headers)
- Non-standard or missing section headers (e.g. creative headers like
  "My Journey" instead of "Experience")
- Leftover artifacts from images/graphics (broken characters, icon
  glyphs, garbled text) suggesting the original had images ATS can't read
- Contact info that's hard to isolate (e.g. buried mid-paragraph instead
  of at the top)
- Extremely short or sparse content that suggests missing sections

Return ONLY a JSON object with this exact shape:
{{
  "score": <integer 0-100, ATS-friendliness score, 100 = perfectly clean>,
  "issues": [
    {{
      "category": "<one of: formatting, parsing, section>",
      "severity": "<one of: low, medium, high>",
      "message": "<specific, actionable description of the issue>"
    }}
  ],
  "suggestions": [
    "<short actionable suggestion>"
  ]
}}

If the resume looks clean, return a high score, an empty "issues" array,
and one or two positive/maintenance suggestions rather than inventing
problems.

RESUME TEXT:
\"\"\"
{input_data.resume_text}
\"\"\"
""".strip()