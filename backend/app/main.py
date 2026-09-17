"""
Run with: uvicorn main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.parsing import routes as parsing_routes

from app.auth import routes as auth_routes

app = FastAPI(title="SkillGap AI API")

# Allow the React frontend (different port) to call this API.
# Tighten allow_origins to your real frontend URL before deploying.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(parsing_routes.router)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "SkillGap AI backend is running"}