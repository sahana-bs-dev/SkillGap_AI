"""
Pydantic schemas shared by every agent, plus the Supervisor's routing types.

One place to change if a JSON contract changes — every agent and the
orchestration layer import from here instead of defining ad-hoc dicts.
"""

from __future__ import annotations

from enum import Enum
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T", bound=BaseModel)


class AgentName(str, Enum):
    SUPERVISOR = "supervisor"
    ATS = "ats"
    JD_ANALYSIS = "jd_analysis"
    MATCHING = "matching"
    SKILL_GAP = "skill_gap"
    LEARNING = "learning"
    RESUME_REWRITE = "resume_rewrite"


class RouteType(str, Enum):
    RESUME_ONLY = "resume_only"        # -> ATS agent only
    RESUME_AND_JD = "resume_and_jd"    # -> JD Analysis -> Matching -> Skill Gap -> Learning


class AgentResult(BaseModel, Generic[T]):
    agent_name: AgentName
    success: bool
    data: Optional[T] = None
    error: Optional[str] = None
    latency_ms: int = 0


# ---------- ATS Agent ----------

class ATSInput(BaseModel):
    resume_text: str


class ATSIssue(BaseModel):
    category: str            # e.g. "formatting", "parsing", "section"
    severity: str             # "low" | "medium" | "high"
    message: str


class ATSOutput(BaseModel):
    score: int = Field(ge=0, le=100)
    issues: list[ATSIssue] = []
    suggestions: list[str] = []


# ---------- JD Analysis Agent ----------

class JDAnalysisInput(BaseModel):
    jd_text: str


class JDAnalysisOutput(BaseModel):
    role_title: Optional[str] = None
    seniority: Optional[str] = None
    required_skills: list[str] = []
    preferred_skills: list[str] = []
    implicit_skills: list[str] = []


# ---------- Matching Agent ----------

class MatchingInput(BaseModel):
    resume_text: str
    jd_analysis: JDAnalysisOutput


class MatchedSkill(BaseModel):
    skill: str
    evidence: str   # must be a real excerpt/paraphrase from the resume, never invented


class MatchingOutput(BaseModel):
    score: int = Field(ge=0, le=100)
    matched_skills: list[MatchedSkill] = []
    missing_skills: list[str] = []
    relevant_experience: list[str] = []


# ---------- Skill Gap Agent ----------

class SkillGapInput(BaseModel):
    matching_output: MatchingOutput


class SkillGapItem(BaseModel):
    skill: str
    priority: str   # "high" | "medium" | "low"
    suggested_projects: list[str] = []


class SkillGapOutput(BaseModel):
    gaps: list[SkillGapItem] = []


# ---------- Learning Agent ----------

class LearningInput(BaseModel):
    gaps: list[SkillGapItem]


class LearningResource(BaseModel):
    title: str
    url: str


class LearningPlanItem(BaseModel):
    skill: str
    learn_resources: list[LearningResource] = []     # pulled from curated_resources.json, never generated raw
    practice_resources: list[LearningResource] = []
    build_project: Optional[str] = None

class LearningOutput(BaseModel):
    plan: list[LearningPlanItem] = []


# ---------- Resume Rewrite Agent ----------

class ResumeRewriteInput(BaseModel):
    resume_text: str
    matching_output: MatchingOutput
    gaps: list[SkillGapItem]


class ResumeRewriteOutput(BaseModel):
    rewritten_text: str
    diff_summary: list[str] = []
    warnings: list[str] = []   # e.g. "could not verify claim X against source resume"


# ---------- Supervisor's pipeline plan ----------

class PipelinePlan(BaseModel):
    route: RouteType
    steps: list[AgentName]


# ---------- Improvement loop tracking ----------

class LoopIteration(BaseModel):
    iteration: int
    score: int
    remaining_gaps: list[str] = []


class LoopState(BaseModel):
    iterations: list[LoopIteration] = []
    finished: bool = False
    stop_reason: Optional[str] = None