"""
MongoDB connection, shared across the whole app.
Every other module imports `db` (or a specific collection) from here.
"""

from pymongo import MongoClient
from app.config import MONGO_URI, MONGO_DB_NAME

client = MongoClient(MONGO_URI)
db = client[MONGO_DB_NAME]

users_collection = db["users"]
resumes_collection = db["resumes"]
analyses_collection = db["analyses"]