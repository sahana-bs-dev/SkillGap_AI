"""
MongoDB connection, shared across the whole app.
Every other module imports `db` (or a specific collection) from here.
"""

from pymongo import MongoClient  # type: ignore
from app.config import MONGO_URI, MONGO_DB_NAME

client = MongoClient(MONGO_URI)
db = client[MONGO_DB_NAME]

users_collection = db["users"]
resumes_collection = db["resumes"]
analyses_collection = db["analyses"]
resume_versions_collection = db["resume_versions"]
skill_plans_collection = db["skill_plans"]

# Phase 9: indexes for the history endpoints and the ATS-score lookup.
analyses_collection.create_index([("user_id", 1), ("created_at", -1)])
analyses_collection.create_index([("user_id", 1), ("flow", 1), ("resume_hash", 1)])

# Saved skill plans: one per (user, analysis), newest first for the "latest" lookup.
skill_plans_collection.create_index([("user_id", 1), ("analysis_id", 1)], unique=True)
skill_plans_collection.create_index([("user_id", 1), ("created_at", -1)])
skill_plans_collection.create_index([("user_id", 1), ("jd_fingerprint", 1), ("created_at", -1)])