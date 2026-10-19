"""
Deterministic helpers for the resume-JD pipeline.

- normalize_jd_analysis: cleans, dedupes, caps and sorts the JD skill lists so the
  same JD always yields the same lists shape (less run-to-run drift).
- apply_match_score: computes the match score in code from matched/missing skills.
  The model only decides which skills have evidence; it never picks the number.
"""

from __future__ import annotations

import re

# Importance weights: required counts most, implicit least.
W_REQUIRED = 6
W_PREFERRED = 3
W_IMPLICIT = 1

# Caps keep the skill list size stable between runs.
MAX_REQUIRED = 12
MAX_PREFERRED = 8
MAX_IMPLICIT = 5


def skill_key(skill: str) -> str:
    """Case/punctuation-insensitive key: 'Node.js' == 'nodejs', 'C++' stays distinct from 'C'."""
    return re.sub(r"[^a-z0-9+#]", "", (skill or "").lower())


def _clean(skills: list[str], seen: set[str], limit: int) -> list[str]:
    out: list[str] = []
    for s in skills or []:
        s = (s or "").strip()
        k = skill_key(s)
        if not k or k in seen:
            continue
        seen.add(k)
        out.append(s)
        if len(out) >= limit:
            break
    return sorted(out, key=str.lower)


def normalize_jd_analysis(jd):
    """Return a copy of the JD analysis with clean, capped, sorted, non-overlapping skill lists."""
    seen: set[str] = set()
    return jd.model_copy(
        update={
            "required_skills": _clean(jd.required_skills, seen, MAX_REQUIRED),
            "preferred_skills": _clean(jd.preferred_skills, seen, MAX_PREFERRED),
            "implicit_skills": _clean(jd.implicit_skills, seen, MAX_IMPLICIT),
        }
    )


def apply_match_score(output, jd):
    """
    Rebuild matched/missing lists from the JD skill lists and compute the score in code.

    A JD skill counts as matched only if the model returned it in matched_skills
    with non-empty evidence. Everything else in the JD lists is missing.
    """
    claimed = {
        skill_key(m.skill): m
        for m in output.matched_skills
        if (m.evidence or "").strip()
    }

    groups = (
        (jd.required_skills, W_REQUIRED),
        (jd.preferred_skills, W_PREFERRED),
        (jd.implicit_skills, W_IMPLICIT),
    )

    earned = 0
    total = 0
    matched = []
    missing: list[str] = []

    for skills, weight in groups:
        for skill in skills:
            total += weight
            hit = claimed.get(skill_key(skill))
            if hit is not None:
                earned += weight
                matched.append(hit.model_copy(update={"skill": skill}))
            else:
                missing.append(skill)

    score = round(100 * earned / total) if total else 0

    return output.model_copy(
        update={
            "score": score,
            "matched_skills": matched,
            "missing_skills": missing,
        }
    )