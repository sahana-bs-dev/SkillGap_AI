"""
Deterministic ATS score.

The score is calculated only from checks done in code, so the same resume
text always gives the same number. The LLM's issues are still shown in the
report, but they do not change the score (they vary from run to run).
"""

from __future__ import annotations

import re

from app.llm.schemas import ATSIssue

# name -> (regex, points lost if the section is missing)
_SECTIONS = {
    "experience": (r"\b(experience|work history|employment|internship)", 15),
    "education": (r"\beducation\b", 10),
    "skills": (r"\bskills\b", 12),
    "projects": (r"\bprojects?\b", 6),
}

_BULLET_CHARS = ("•", "-", "*", "▪", "●", "◦", "–")


def compute_ats_score(text: str, llm_issues: list[ATSIssue] | None = None) -> int:
    # llm_issues is accepted for compatibility but intentionally not used.
    t = text or ""
    low = t.lower()
    lines = [l.strip() for l in t.splitlines() if l.strip()]
    words = len(t.split())
    score = 100

    # 1. Standard sections
    for pattern, cost in _SECTIONS.values():
        if not re.search(pattern, low):
            score -= cost

    # 2. Contact info
    if not re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", t):
        score -= 10
    if not re.search(r"\+?\d[\d\s().-]{8,}\d", t):
        score -= 5
    if not re.search(r"(linkedin\.com|github\.com)", low):
        score -= 3

    # 3. Length
    if words < 150:
        score -= 25
    elif words < 300:
        score -= 10
    elif words > 1200:
        score -= 5

    # 4. Extraction artifacts (icon glyphs, replacement characters)
    junk = len(re.findall(r"[\ue000-\uf8ff\ufffd]", t))
    if junk:
        score -= min(15, 3 + junk)

    # 5. Column-interleaving heuristic: too many very short lines
    if lines:
        short_ratio = sum(1 for l in lines if len(l) < 18) / len(lines)
        if short_ratio > 0.5:
            score -= 8

    # 6. Content signal: enough bullets, and some with numbers/metrics
    bullets = [l for l in lines if l.startswith(_BULLET_CHARS)]
    if len(bullets) < 5:
        score -= 8
    else:
        with_numbers = sum(1 for b in bullets if re.search(r"\d", b))
        if with_numbers / len(bullets) < 0.2:
            score -= 5

    return max(0, min(100, score))