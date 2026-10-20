"""
Saved skill plans (Skill gap page): the prioritized gaps, the learning plan and
which steps the user has ticked, stored per user so progress survives a reload.

POST  /api/skill-plans                      save a freshly built plan for one analysis
GET   /api/skill-plans                      short list of the user's plans (newest first)
GET   /api/skill-plans/latest               the newest plan
GET   /api/skill-plans/by-analysis/{id}     the plan that belongs to one analysis
GET   /api/skill-plans/{id}                 one full plan
PATCH /api/skill-plans/{id}/progress        save ticks (and per-skill notes)

Rules:
  - One plan per (user, analysis). POST again for the same analysis returns the
    saved plan and never overwrites ticks.
  - Same job, new analysis (the user updated the resume and matched again): ticks
    and notes are carried over for skills that are still gaps.
  - "Covered" skill = its Build step is ticked. A skill with no Build step counts
    as covered when all of its steps are ticked.
  - "Learned" skill = EVERY step of the skill is ticked (Learn, Practice and Build).
    Resume Rewrite adds learned skills to the resume, and nothing else decides
    what gets added.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId  # type: ignore
from bson.errors import InvalidId  # type: ignore
from fastapi import APIRouter, Depends, HTTPException  # type: ignore
from pydantic import BaseModel  # type: ignore
from pymongo.errors import DuplicateKeyError  # type: ignore

from app.auth.jwt_handler import get_current_user
from app.db.mongo_client import analyses_collection, skill_plans_collection
from app.llm.schemas import LearningPlanItem, MatchingOutput, SkillGapItem
from app.utils.history_utils import iso_utc
from app.utils.match_scoring import skill_key

router = APIRouter(prefix="/api/skill-plans", tags=["skill-plans"])

MAX_NOTE_LENGTH = 600


# ---------- request bodies ----------

class PlanCreate(BaseModel):
    analysis_id: str
    resume_text: str
    matching_output: MatchingOutput
    gaps: list[SkillGapItem] = []
    plan: list[LearningPlanItem] = []


class ProgressUpdate(BaseModel):
    checked: dict[str, bool] = {}          # { "skill::step": true }  (send the full map)
    notes: Optional[dict[str, str]] = None  # { "skill": "what I built..." }  (full map, optional)


# ---------- helpers ----------

def _object_id(value: str, what: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {what}")


def _step_keys(item: dict) -> list[str]:
    """Same steps, same order as the Skill gap page: learn, practice, build."""
    keys = []
    if item.get("learn_resources"):
        keys.append("learn")
    if item.get("practice_resources"):
        keys.append("practice")
    if item.get("build_project"):
        keys.append("build")
    return keys


def _valid_keys(plan: list[dict]) -> set[str]:
    return {f"{p['skill']}::{k}" for p in plan for k in _step_keys(p)}


def learned_skills(plan: list[dict], checked: dict) -> list[dict]:
    """Skills whose steps are ALL ticked, with the Build project text for each."""
    out = []
    for item in plan:
        steps = _step_keys(item)
        if not steps:
            continue
        if all(checked.get(f"{item['skill']}::{k}") for k in steps):
            out.append({"skill": item["skill"], "project": item.get("build_project")})
    return out


def _progress(plan: list[dict], checked: dict) -> dict:
    total = 0
    done = 0
    covered = []
    for item in plan:
        steps = _step_keys(item)
        ticked = [k for k in steps if checked.get(f"{item['skill']}::{k}")]
        total += len(steps)
        done += len(ticked)
        if not steps:
            continue
        if "build" in steps:
            is_covered = "build" in ticked
        else:
            is_covered = len(ticked) == len(steps)
        if is_covered:
            covered.append(item["skill"])
    return {
        "done": done,
        "total": total,
        "pct": round(100 * done / total) if total else 0,
        "covered_skills": covered,
        "learned_skills": learned_skills(plan, checked),
    }


def _full(doc: dict) -> dict:
    plan = doc.get("plan", [])
    checked = doc.get("checked", {})
    return {
        "id": str(doc["_id"]),
        "analysis_id": doc.get("analysis_id"),
        "jd_title": doc.get("jd_title"),
        "jd_fingerprint": doc.get("jd_fingerprint"),
        "created_at": iso_utc(doc["created_at"]),
        "updated_at": iso_utc(doc["updated_at"]),
        "resume_text": doc.get("resume_text", ""),
        "matching_output": doc.get("matching_output"),
        "gaps": doc.get("gaps", []),
        "plan": plan,
        "checked": checked,
        "notes": doc.get("notes", {}),
        "progress": _progress(plan, checked),
    }


def _summary(doc: dict) -> dict:
    plan = doc.get("plan", [])
    return {
        "id": str(doc["_id"]),
        "analysis_id": doc.get("analysis_id"),
        "jd_title": doc.get("jd_title"),
        "jd_fingerprint": doc.get("jd_fingerprint"),
        "created_at": iso_utc(doc["created_at"]),
        "updated_at": iso_utc(doc["updated_at"]),
        "gap_count": len(doc.get("gaps", [])),
        "progress": _progress(plan, doc.get("checked", {})),
    }


def _carry_over(previous: dict, plan: list[dict]) -> tuple[dict, dict]:
    """Ticks and notes from an earlier plan for the same job, for skills still in this plan."""
    by_key = {skill_key(p["skill"]): p for p in plan}
    checked: dict[str, bool] = {}
    for key, value in (previous.get("checked") or {}).items():
        if not value or "::" not in key:
            continue
        skill, step = key.split("::", 1)
        item = by_key.get(skill_key(skill))
        if item and step in _step_keys(item):
            checked[f"{item['skill']}::{step}"] = True

    notes: dict[str, str] = {}
    for skill, text in (previous.get("notes") or {}).items():
        item = by_key.get(skill_key(skill))
        if item and (text or "").strip():
            notes[item["skill"]] = text.strip()[:MAX_NOTE_LENGTH]
    return checked, notes


# ---------- routes ----------

@router.post("")
def create_plan(payload: PlanCreate, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])

    analysis = analyses_collection.find_one(
        {"_id": _object_id(payload.analysis_id, "analysis id"), "user_id": user_id}
    )
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    existing = skill_plans_collection.find_one(
        {"user_id": user_id, "analysis_id": payload.analysis_id}
    )
    if existing:
        return _full(existing)

    plan = [p.model_dump() for p in payload.plan]
    gaps = [g.model_dump() for g in payload.gaps]

    checked: dict = {}
    notes: dict = {}
    fingerprint = analysis.get("jd_fingerprint")
    if fingerprint:
        previous = skill_plans_collection.find_one(
            {"user_id": user_id, "jd_fingerprint": fingerprint},
            sort=[("created_at", -1)],
        )
        if previous:
            checked, notes = _carry_over(previous, plan)

    now = datetime.now(timezone.utc)
    doc = {
        "user_id": user_id,
        "analysis_id": payload.analysis_id,
        "jd_title": analysis.get("jd_title"),
        "jd_fingerprint": fingerprint,
        "resume_text": payload.resume_text,
        "matching_output": payload.matching_output.model_dump(),
        "gaps": gaps,
        "plan": plan,
        "checked": checked,
        "notes": notes,
        "created_at": now,
        "updated_at": now,
    }
    try:
        inserted = skill_plans_collection.insert_one(doc)
    except DuplicateKeyError:
        # Two requests raced (for example React dev mode): keep the first one.
        return _full(
            skill_plans_collection.find_one({"user_id": user_id, "analysis_id": payload.analysis_id})
        )
    doc["_id"] = inserted.inserted_id
    return _full(doc)


@router.get("")
def list_plans(current_user: dict = Depends(get_current_user)):
    cursor = (
        skill_plans_collection.find({"user_id": str(current_user["_id"])})
        .sort("created_at", -1)
        .limit(200)
    )
    return [_summary(d) for d in cursor]


@router.get("/latest")
def latest_plan(current_user: dict = Depends(get_current_user)):
    doc = skill_plans_collection.find_one(
        {"user_id": str(current_user["_id"])}, sort=[("created_at", -1)]
    )
    if not doc:
        raise HTTPException(status_code=404, detail="No saved skill plan yet")
    return _full(doc)


@router.get("/by-analysis/{analysis_id}")
def plan_for_analysis(analysis_id: str, current_user: dict = Depends(get_current_user)):
    doc = skill_plans_collection.find_one(
        {"user_id": str(current_user["_id"]), "analysis_id": analysis_id}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="No skill plan for this analysis")
    return _full(doc)


@router.get("/{plan_id}")
def get_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    doc = skill_plans_collection.find_one(
        {"_id": _object_id(plan_id, "plan id"), "user_id": str(current_user["_id"])}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Skill plan not found")
    return _full(doc)


@router.patch("/{plan_id}/progress")
def save_progress(plan_id: str, payload: ProgressUpdate, current_user: dict = Depends(get_current_user)):
    query = {"_id": _object_id(plan_id, "plan id"), "user_id": str(current_user["_id"])}
    doc = skill_plans_collection.find_one(query)
    if not doc:
        raise HTTPException(status_code=404, detail="Skill plan not found")

    plan = doc.get("plan", [])
    valid = _valid_keys(plan)
    checked = {k: True for k, v in payload.checked.items() if v and k in valid}

    update = {"checked": checked, "updated_at": datetime.now(timezone.utc)}
    if payload.notes is not None:
        skills = {p["skill"] for p in plan}
        update["notes"] = {
            s: t.strip()[:MAX_NOTE_LENGTH]
            for s, t in payload.notes.items()
            if s in skills and (t or "").strip()
        }

    skill_plans_collection.update_one(query, {"$set": update})
    saved = skill_plans_collection.find_one(query)
    return {
        "checked": saved.get("checked", {}),
        "notes": saved.get("notes", {}),
        "updated_at": iso_utc(saved["updated_at"]),
        "progress": _progress(plan, saved.get("checked", {})),
    }