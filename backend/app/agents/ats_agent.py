"""
ATS Agent — Groq (openai/gpt-oss-20b).

Checks a resume's plain-text for the kind of formatting/parsing issues
that trip up real ATS software (tables, columns, non-standard section
headers, missing standard sections, odd characters left over from PDF
extraction, etc.) and returns a structured issue list.

The numeric score is NOT trusted from the model. The /analyze/ats route
overwrites it with app.utils.ats_scoring.compute_ats_score(), which is
calculated in code from the resume text and these issues.

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
through a PDF/DOCX text extractor). Your job is to find problems that
would hurt how well this resume is parsed by real ATS software, based
only on what's visible in this extracted text.

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
- Weak bullet points: no action verbs, no numbers or measurable results

Be strict and specific. Only report problems that are actually present in
the text, and do not invent problems. Rate each issue's severity honestly:
"high" for something that would break parsing or remove a whole section,
"medium" for something that could confuse a parser, "low" for polish.

Return ONLY a JSON object with this exact shape:
{{
  "score": 0,
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

Always set "score" to 0; it is calculated separately and your value is
ignored. If the resume has no real problems, return an empty "issues"
array and one or two maintenance suggestions.

RESUME TEXT:
\"\"\"
{input_data.resume_text}
\"\"\"
""".strip()