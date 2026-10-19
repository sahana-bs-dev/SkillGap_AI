"""
Read-only database check for SkillGap AI (Phase 9 data).

Run it from the backend folder (the one that contains the `app` folder):

    python check_db.py

It only reads. It never inserts, changes or deletes anything.
"""

from collections import Counter
from datetime import datetime

from bson import ObjectId

from app.db.mongo_client import (
    analyses_collection,
    loop_runs_collection,
    resume_versions_collection,
    resumes_collection,
    users_collection,
)

problems = []


def problem(message):
    problems.append(message)


def section(title):
    print("\n" + "=" * 8 + " " + title + " " + "=" * 8)


def score_ok(value):
    return value is None or (isinstance(value, int) and not isinstance(value, bool) and 0 <= value <= 100)


def when(value):
    return value.strftime("%Y-%m-%d %H:%M:%S") if isinstance(value, datetime) else str(value)


# ---------------------------------------------------------------- counts
section("Collections")
print("users:           ", users_collection.count_documents({}))
print("resumes:         ", resumes_collection.count_documents({}))
print("analyses:        ", analyses_collection.count_documents({}))
print("resume_versions: ", resume_versions_collection.count_documents({}))
print("loop_runs:       ", loop_runs_collection.count_documents({}))

user_ids = set()
for user in users_collection.find({}, {"_id": 1}):
    user_ids.add(str(user["_id"]))

# -------------------------------------------------------------- analyses
section("Analyses: newest 5")
for d in analyses_collection.find({}).sort("created_at", -1).limit(5):
    print(
        when(d.get("created_at")),
        "|", d.get("flow"),
        "| job:", d.get("jd_title"),
        "| fp:", d.get("jd_fingerprint"),
        "| ats:", d.get("ats_score"),
        "| match:", d.get("match_score"),
        "| matched:", len(d.get("matched_skills") or []),
        "| missing:", len(d.get("missing_skills") or []),
    )

per_user = Counter()
for d in analyses_collection.find({}).limit(5000):
    label = "analysis " + str(d["_id"])
    per_user[d.get("user_id")] += 1

    if not isinstance(d.get("user_id"), str) or not d.get("user_id"):
        problem(label + ": user_id missing or not a string")
    elif d["user_id"] not in user_ids:
        problem(label + ": user_id does not match any user")

    if not isinstance(d.get("created_at"), datetime):
        problem(label + ": created_at is not a datetime")

    flow = d.get("flow")
    if flow not in ("resume_only", "resume_jd"):
        problem(label + ": flow is '" + str(flow) + "'")

    if not score_ok(d.get("ats_score")):
        problem(label + ": ats_score is not a whole number from 0 to 100 (" + str(d.get("ats_score")) + ")")
    if not score_ok(d.get("match_score")):
        problem(label + ": match_score is not a whole number from 0 to 100 (" + str(d.get("match_score")) + ")")

    if not d.get("resume_hash"):
        problem(label + ": resume_hash missing")

    if flow == "resume_only":
        if d.get("ats_score") is None:
            problem(label + ": resume_only record has no ats_score")
        if d.get("match_score") is not None:
            problem(label + ": resume_only record has a match_score")
    if flow == "resume_jd":
        if d.get("match_score") is None:
            problem(label + ": resume_jd record has no match_score")
        if not d.get("jd_fingerprint"):
            problem(label + ": resume_jd record has no jd_fingerprint")
        if not d.get("jd_title"):
            problem(label + ": resume_jd record has no jd_title")
        for skill in d.get("matched_skills") or []:
            if not isinstance(skill, str):
                problem(label + ": matched_skills should be plain names, found " + type(skill).__name__)
                break

section("Analyses per user")
for uid, count in per_user.most_common():
    print(str(uid)[:24], "->", count)

# ------------------------------------------------------------ loop runs
section("Loop runs: newest 5")
for d in loop_runs_collection.find({}).sort("created_at", -1).limit(5):
    scores = [str(i.get("score")) for i in d.get("iterations") or []]
    print(
        when(d.get("created_at")),
        "| job:", d.get("jd_title"),
        "| best round:", d.get("best_iteration"),
        "| version:", d.get("version_no"),
        "| scores:", " > ".join(scores),
    )

for d in loop_runs_collection.find({}).limit(2000):
    label = "loop_run " + str(d["_id"])
    iterations = d.get("iterations") or []
    if not iterations:
        problem(label + ": no iterations stored")
    rounds = {i.get("iteration") for i in iterations}
    if d.get("best_iteration") is not None and d["best_iteration"] not in rounds:
        problem(label + ": best_iteration " + str(d["best_iteration"]) + " is not one of the stored rounds")
    if d.get("user_id") not in user_ids:
        problem(label + ": user_id does not match any user")
    if d.get("version_id"):
        try:
            if resume_versions_collection.count_documents({"_id": ObjectId(d["version_id"])}) == 0:
                problem(label + ": version_id points to a version that does not exist")
        except Exception:  # noqa: BLE001
            problem(label + ": version_id is not a valid id")

# ------------------------------------------------------ resume versions
section("Resume versions")
versions_by_user = {}
sources = Counter()
for d in resume_versions_collection.find({}).limit(5000):
    versions_by_user.setdefault(d.get("user_id"), []).append(d.get("version_no"))
    sources[d.get("source") or "rewrite"] += 1
    if not d.get("rewritten_text"):
        problem("resume_version " + str(d["_id"]) + ": rewritten_text is empty")
print("by source:", dict(sources))
for uid, numbers in versions_by_user.items():
    ordered = sorted(n for n in numbers if isinstance(n, int))
    if len(ordered) != len(set(ordered)):
        problem("user " + str(uid)[:24] + ": duplicate version numbers " + str(ordered))
    print(str(uid)[:24], "-> versions", ordered)

# --------------------------------------------------------------- indexes
section("Indexes")
print("analyses:  ", sorted(analyses_collection.index_information().keys()))
print("loop_runs: ", sorted(loop_runs_collection.index_information().keys()))

# --------------------------------------------------------------- summary
section("Result")
if not problems:
    print("No problems found.")
else:
    print(str(len(problems)) + " problem(s) found:")
    for message in problems[:50]:
        print(" -", message)
    if len(problems) > 50:
        print(" ... and " + str(len(problems) - 50) + " more")