"""
Scores a rewritten resume so History and the Dashboard can plot "after rewrite" points.

  - ATS score: compute_ats_score(), the same code-only calculation /analyze/match saves
    for every analysis, so before and after are directly comparable. No AI call.
  - Match score: only when the rewrite belongs to an analysis (job mode). It re-runs the
    Matching agent on the new text against the SAME job analysis that was cached for the
    original match, then apply_match_score() computes the number in code.

Scoring never breaks a rewrite: if anything fails the rewrite is still saved, and the
scores that could not be worked out are simply None.

Match scoring uses the AI agent, so the same text can score a few points differently
between runs. Treat a change of a point or two as noise.
"""

from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId  # type: ignore
from bson.errors import InvalidId  # type: ignore

from app.db.mongo_client import analyses_collection
from app.llm.schemas import JDAnalysisOutput, MatchingInput
from app.utils.ats_scoring import compute_ats_score
from app.utils.match_scoring import apply_match_score

_jd_cache = analyses_collection.database["jd_cache"]  # same cache the match route fills


def _num(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def score_rewrite(user_id: str, original_text: str, rewritten_text: str, analysis_id: str | None) -> dict:
    scores = {
        "analysis_id": None,
        "jd_title": None,
        "ats_before": compute_ats_score(original_text, []),
        "ats_after": compute_ats_score(rewritten_text, []),
        "match_before": None,
        "match_after": None,
        "matched_skills": [],
        "missing_skills": [],
        "scored_at": datetime.now(timezone.utc).isoformat(),
    }
    if not analysis_id:
        return scores

    try:
        analysis = analyses_collection.find_one({"_id": ObjectId(analysis_id), "user_id": user_id})
    except (InvalidId, TypeError):
        return scores
    if not analysis:
        return scores

    scores["analysis_id"] = analysis_id
    scores["jd_title"] = analysis.get("jd_title")
    scores["match_before"] = _num(analysis.get("match_score"))

    try:
        cached = _jd_cache.find_one({"_id": analysis.get("jd_fingerprint")})
        if not cached or not cached.get("analysis"):
            return scores
        jd = JDAnalysisOutput(**cached["analysis"])

        from app.routes.analyze import _matching_agent  # imported here to avoid a circular import

        result = _matching_agent.run(MatchingInput(resume_text=rewritten_text, jd_analysis=jd))
        if not result.success:
            print(f"[rewrite_scoring] match re-score failed: {result.error}")
            return scores
        match = apply_match_score(result.data, jd)
        scores["match_after"] = match.score
        scores["matched_skills"] = [m.skill for m in match.matched_skills]
        scores["missing_skills"] = match.missing_skills
    except Exception as exc:  # noqa: BLE001
        print(f"[rewrite_scoring] match re-score error: {exc}")
    return scores