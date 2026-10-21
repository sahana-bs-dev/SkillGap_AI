"""
Run with (from the backend folder): uvicorn app.main:app --reload
"""

from fastapi import FastAPI  # type: ignore
from fastapi.middleware.cors import CORSMiddleware  # type: ignore
from app.parsing import routes as parsing_routes
from app.auth import routes as auth_routes
from app.routes import analyze
from app.routes.resume import router as resume_router
from app.routes.history import router as history_router
from app.routes.skill_plans import router as skill_plans_router
app = FastAPI(title="SkillGap AI API")

app.include_router(resume_router)
app.include_router(history_router)
app.include_router(skill_plans_router)

app.include_router(analyze.router)

# Allow the React frontend (different port) to call this API.
# Tighten allow_origins to your real frontend URL before deploying.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000","https://skill-gap-ai-lyart.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(parsing_routes.router)


@app.get("/")
def health_check():
    return {"status": "ok", "message": "SkillGap AI backend is running"}