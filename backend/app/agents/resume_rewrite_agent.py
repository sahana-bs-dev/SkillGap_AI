"""
Resume Rewrite Agent (Gemini).

Rewrites the resume for the target JD WITHOUT inventing anything.
Two layers of protection against fabrication:
  1. The prompt forbids adding facts and lists the missing skills as off-limits.
  2. run() checks the output in code: any number, missing skill, inflated
     verb, or new capitalised term that isn't in the original resume counts
     as a violation. On a violation it retries once with the offending items
     named; anything still unverified is returned in `warnings` so the UI
     can show it.
"""

from __future__ import annotations

import re

from app.agents.base_agent import BaseAgent
from app.llm.schemas import (
    AgentName,
    AgentResult,
    ResumeRewriteInput,
    ResumeRewriteOutput,
)

REWRITE_MODEL = "gemini-3.5-flash"

_NUM = re.compile(r"\d+(?:[.,]\d+)*%?")
_WORD = re.compile(r"[A-Za-z][A-Za-z0-9+#]*(?:[.\-][A-Za-z0-9+#]+)*")
_SEGMENT_SPLIT = re.compile(r"[.;:!?]\s+|\s[-–•]\s")

# Verbs that claim more than a plain "built/created/developed". Allowed only
# if the original resume already uses the same word.
_INFLATED_VERBS = (
    "architected", "engineered", "designed", "spearheaded", "orchestrated",
    "pioneered", "led", "managed", "directed", "championed", "optimized",
    "streamlined", "revamped", "overhauled",
)


def _has_term(term: str, text: str) -> bool:
    pattern = r"(?<![a-z0-9])" + re.escape(term.lower()) + r"(?![a-z0-9])"
    return re.search(pattern, text.lower()) is not None


def _squash(text: str) -> str:
    """Lowercase and strip everything except letters/digits/+/#, so spacing
    differences (e.g. 'GSSSInstitute' vs 'GSSS Institute') don't matter."""
    return re.sub(r"[^a-z0-9+#]", "", text.lower())


class ResumeRewriteAgent(BaseAgent[ResumeRewriteInput, ResumeRewriteOutput]):
    name = AgentName.RESUME_REWRITE
    output_schema = ResumeRewriteOutput

    def __init__(self, llm_client, model: str, _feedback: str = ""):
        super().__init__(llm_client, model)
        self._feedback = _feedback

    # ---------- prompt ----------

    def build_prompt(self, input_data: ResumeRewriteInput) -> str:
        matched = "\n".join(
            f"- {m.skill}: {m.evidence}" for m in input_data.matching_output.matched_skills
        ) or "- (none)"
        missing = ", ".join(input_data.matching_output.missing_skills) or "(none)"
        banned_verbs = ", ".join(_INFLATED_VERBS)

        feedback_block = ""
        if self._feedback:
            feedback_block = (
                "\nYOUR PREVIOUS ATTEMPT WAS REJECTED because it contained items "
                "that are not in the original resume: "
                f"{self._feedback}.\nRemove them completely and do not add anything similar.\n"
            )

        return f"""You are a resume editor. Rewrite the resume below so it reads stronger for the target job, using ONLY facts already in the resume.

STRICT RULES (never break these):
1. Do NOT add any skill, tool, technology, employer, project, degree, certification, date, or number that is not already in the original resume.
2. Do NOT add any of these missing skills, even as "familiar with" or "learning": {missing}
3. You may only: reword bullets, tighten wording, reorder bullets or sections so relevant work comes first, and use the JD's wording for skills the resume already shows (see matched skills below).
4. Never invent metrics. If a bullet has no numbers, leave it without numbers.
5. If you are unsure whether something is supported by the resume, keep the original wording.
6. Keep every section and every project/experience entry from the original. Output plain text, same structure.
7. NEVER delete or drop any skill, tool, or technology that already appears in the original resume, even if it appears in the missing-skills list above. Rule 2 only forbids ADDING skills that are absent from the original. If a skill is in the original, keep it exactly where it is.
8. Improve clarity and flow, but do not change what the person did. If words in the original are stuck together without spaces, fix the spacing only.
9. Do NOT rename, reinterpret, or add technology terms. For example, "web search" must not become "web scraping", and "API" must not become "REST API", unless the exact term is already in the original.
10. Use only plain action verbs that mean the same as the original, such as: built, created, developed, made, implemented, wrote, set up, worked on. Do NOT use these stronger verbs unless the original resume already uses that exact word: {banned_verbs}. Never claim leadership, ownership, design decisions, or scale that the original does not state.

MATCHED SKILLS (safe to emphasise, with evidence from the resume):
{matched}

MISSING SKILLS (must NOT be added if absent from the original; keep them if already present): {missing}
{feedback_block}
ORIGINAL RESUME:
\"\"\"
{input_data.resume_text}
\"\"\"

Return ONLY this JSON object:
{{
  "rewritten_text": "the full rewritten resume as plain text",
  "diff_summary": ["Section: what you changed and why", "..."],
  "warnings": ["places where the resume lacks information you could not improve, e.g. 'Project X has no measurable result; add a real one yourself'"]
}}"""

    # ---------- no-fabrication guard ----------

    @staticmethod
    def _find_violations(input_data: ResumeRewriteInput, rewritten: str) -> list[str]:
        original = input_data.resume_text
        original_squashed = _squash(original)
        found: list[str] = []

        # 1. numbers not in the original
        original_numbers = set(_NUM.findall(original))
        for n in _NUM.findall(rewritten):
            if n not in original_numbers:
                found.append(f"number '{n}'")

        # 2. missing skills that were injected
        skills = list(input_data.matching_output.missing_skills) + [
            g.skill for g in input_data.gaps
        ]
        for skill in skills:
            if not skill.strip():
                continue
            in_original = _has_term(skill, original) or _squash(skill) in original_squashed
            if _has_term(skill, rewritten) and not in_original:
                found.append(f"skill '{skill}'")

        # 3. inflated verbs the original never used
        for verb in _INFLATED_VERBS:
            if _has_term(verb, rewritten) and not _has_term(verb, original):
                found.append(f"verb '{verb}'")

        # 4. new capitalised / tech-looking terms (companies, tools, etc.)
        original_words = {w.lower() for w in _WORD.findall(original)}
        for line in rewritten.splitlines():
            for segment in _SEGMENT_SPLIT.split(line):
                tokens = _WORD.findall(segment)
                for token in tokens[1:]:  # first word of a segment is just a verb/heading
                    looks_like_term = token[0].isupper() or "+" in token or "#" in token
                    if not looks_like_term:
                        continue
                    if token.lower() in original_words:
                        continue
                    if _squash(token) in original_squashed:
                        continue  # same word, original just had no spaces
                    found.append(f"term '{token}'")

        return list(dict.fromkeys(found))

    # ---------- run with guard ----------

    def run(self, input_data: ResumeRewriteInput) -> AgentResult[ResumeRewriteOutput]:
        result = super().run(input_data)
        if not result.success:
            return result

        violations = self._find_violations(input_data, result.data.rewritten_text)

        if violations and not self._feedback:
            retry = ResumeRewriteAgent(
                self.llm_client, self.model, _feedback=", ".join(violations)
            ).run(input_data)
            if retry.success:
                return retry  # the retry already attached its own warnings

        for v in violations:
            result.data.warnings.append(f"Not found in your original resume: {v}")
        return result