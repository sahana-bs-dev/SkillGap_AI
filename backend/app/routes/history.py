"""
GET /api/history/analyses  — the current user's saved analyses (newest first)
GET /api/history/loops     — the current user's improvement-loop runs (newest first)

Both are scoped to the logged-in user. Loop runs come from loop_runs; runs
saved before that collection existed are still read from resume_versions
documents with source == "improvement_loop".
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth.jwt_handler import get_current_user
from app.db.mongo_client import (
    analyses_collection,
    loop_runs_collection,
    resume_versions_collection,
)
from app.utils.history_utils import iso_utc

router = APIRouter(prefix="/api/history", tags=["history"])

_STOP_PREFIX = "Stopped because: "


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


def _best_iteration(iterations: list) -> int | None:
    accepted = [i for i in iterations if i.get("accepted") and i.get("score") is not None]
    return max(accepted, key=lambda i: i["score"])["iteration"] if accepted else None


@router.get("/loops")
def list_loops(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    entries = []  # (created_at, item)

    # Current records: one per loop run, including runs where the original was already best.
    runs = list(
        loop_runs_collection.find({"user_id": user_id}).sort("created_at", -1).limit(100)
    )
    covered_version_ids = set()
    for d in runs:
        if d.get("version_id"):
            covered_version_ids.add(d["version_id"])
        entries.append(
            (
                d["created_at"],
                {
                    "id": str(d["_id"]),
                    "created_at": iso_utc(d["created_at"]),
                    "jd_title": d.get("jd_title"),
                    "jd_fingerprint": d.get("jd_fingerprint"),
                    "version_id": d.get("version_id"),
                    "version_no": d.get("version_no"),
                    "best_iteration": d.get("best_iteration"),
                    "stop_reason": d.get("stop_reason"),
                    "iterations": d.get("iterations", []),
                },
            )
        )

    # Older runs, saved only as resume versions before loop_runs existed.
    legacy = (
        resume_versions_collection.find({"user_id": user_id, "source": "improvement_loop"})
        .sort("created_at", -1)
        .limit(100)
    )
    for d in legacy:
        if str(d["_id"]) in covered_version_ids:
            continue
        iters = d.get("loop_iterations", [])
        summary = d.get("diff_summary") or []  # stored as a list, not a string
        stop = summary[1] if len(summary) > 1 else None
        if stop and stop.startswith(_STOP_PREFIX):
            stop = stop[len(_STOP_PREFIX):]
        entries.append(
            (
                d["created_at"],
                {
                    "id": str(d["_id"]),
                    "created_at": iso_utc(d["created_at"]),
                    "jd_title": d.get("jd_title"),
                    "jd_fingerprint": d.get("jd_fingerprint"),
                    "version_id": str(d["_id"]),
                    "version_no": d.get("version_no"),
                    "best_iteration": _best_iteration(iters),
                    "stop_reason": stop,
                    "iterations": iters,
                },
            )
        )

    entries.sort(key=lambda e: e[0], reverse=True)
    return [item for _, item in entries[:100]]