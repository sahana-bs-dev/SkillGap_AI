"""
GET /api/history/analyses  — the current user's saved analyses (newest first)

Scoped to the logged-in user. Resume versions have their own routes in
routes/resume.py (/api/resume/versions).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends  # type: ignore

from app.auth.jwt_handler import get_current_user
from app.db.mongo_client import analyses_collection
from app.utils.history_utils import iso_utc

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("/analyses")
def list_analyses(current_user: dict = Depends(get_current_user)):
    cursor = (
        analyses_collection.find({"user_id": str(current_user["_id"])})
        .sort("created_at", -1)
        .limit(200)
    )
    return [
        {
            "id": str(d["_id"]),
            "created_at": iso_utc(d["created_at"]),
            "flow": d.get("flow", "resume_jd"),
            "jd_title": d.get("jd_title"),
            "jd_fingerprint": d.get("jd_fingerprint"),
            "ats_score": d.get("ats_score"),
            "match_score": d.get("match_score"),
            "matched_skills": d.get("matched_skills", []),
            "missing_skills": d.get("missing_skills", []),
        }
        for d in cursor
    ]