"""
POST /api/resume/rewrite            — run the Resume Rewrite Agent and save the result as a new version
GET  /api/resume/versions           — list the current user's versions (newest first)
GET  /api/resume/versions/{id}      — one full version (original + rewritten + diff summary + warnings)

Versions are always scoped to the logged-in user. A rewrite is only saved
if the agent succeeded; agent failures come back as 502, same as /analyze.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException

from app.agents.resume_rewrite_agent import REWRITE_MODEL, ResumeRewriteAgent
from app.auth.jwt_handler import get_current_user
from app.db.mongo_client import resume_versions_collection
from app.llm.gemini_client import GeminiClient
from app.llm.schemas import ResumeRewriteInput, ResumeRewriteOutput

router = APIRouter(prefix="/api/resume", tags=["resume"])

_rewrite_agent = ResumeRewriteAgent(llm_client=GeminiClient(), model=REWRITE_MODEL)


class RewriteRequest(ResumeRewriteInput):
    parent_version_id: Optional[str] = None


class RewriteResponse(ResumeRewriteOutput):
    version_id: str
    version_no: int
    created_at: str


def _to_object_id(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail="Invalid version id")


@router.post("/rewrite", response_model=RewriteResponse)
def rewrite_resume(payload: RewriteRequest, current_user: dict = Depends(get_current_user)):
    if not payload.resume_text or not payload.resume_text.strip():
        raise HTTPException(status_code=400, detail="resume_text is empty")

    user_id = str(current_user["_id"])

    if payload.parent_version_id:
        parent = resume_versions_collection.find_one(
            {"_id": _to_object_id(payload.parent_version_id), "user_id": user_id}
        )
        if not parent:
            raise HTTPException(status_code=404, detail="Parent version not found")

    agent_input = ResumeRewriteInput(
        resume_text=payload.resume_text,
        matching_output=payload.matching_output,
        gaps=payload.gaps,
    )
    result = _rewrite_agent.run(agent_input)
    if not result.success:
        raise HTTPException(status_code=502, detail=f"Resume rewrite failed: {result.error}")

    data = result.data
    version_no = resume_versions_collection.count_documents({"user_id": user_id}) + 1
    created_at = datetime.now(timezone.utc)

    doc = {
        "user_id": user_id,
        "version_no": version_no,
        "parent_version_id": payload.parent_version_id,
        "original_text": payload.resume_text,
        "rewritten_text": data.rewritten_text,
        "diff_summary": data.diff_summary,
        "warnings": data.warnings,
        "created_at": created_at,
    }
    inserted = resume_versions_collection.insert_one(doc)

    return RewriteResponse(
        rewritten_text=data.rewritten_text,
        diff_summary=data.diff_summary,
        warnings=data.warnings,
        version_id=str(inserted.inserted_id),
        version_no=version_no,
        created_at=created_at.isoformat(),
    )


@router.get("/versions")
def list_versions(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    cursor = resume_versions_collection.find({"user_id": user_id}).sort("created_at", -1)

    versions = []
    for doc in cursor:
        versions.append(
            {
                "id": str(doc["_id"]),
                "version_no": doc["version_no"],
                "parent_version_id": doc.get("parent_version_id"),
                "created_at": doc["created_at"].isoformat(),
                "warning_count": len(doc.get("warnings", [])),
                "preview": doc["rewritten_text"][:150],
            }
        )
    return versions


@router.get("/versions/{version_id}")
def get_version(version_id: str, current_user: dict = Depends(get_current_user)):
    doc = resume_versions_collection.find_one(
        {"_id": _to_object_id(version_id), "user_id": str(current_user["_id"])}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Version not found")

    return {
        "id": str(doc["_id"]),
        "version_no": doc["version_no"],
        "parent_version_id": doc.get("parent_version_id"),
        "created_at": doc["created_at"].isoformat(),
        "original_text": doc["original_text"],
        "rewritten_text": doc["rewritten_text"],
        "diff_summary": doc.get("diff_summary", []),
        "warnings": doc.get("warnings", []),
    }