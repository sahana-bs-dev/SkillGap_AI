# Phase 6 — Skill Gap + Learning Agents (Backend)

**Status:** Code complete, tested end-to-end via `/analyze/skill-gap` and `/analyze/learning`. Joint QA (resource links + project scoping) still pending — see `phase6_frontend.md`.

---

## What was built

### 1. Skill Gap Agent
- Provider: **Groq**, model `openai/gpt-oss-120b`
- Takes the Matching Agent's output and, for every entry in `missing_skills`, produces a prioritized gap item (`high` / `medium` / `low`) plus 1-3 realistically-scoped student project ideas.
- Lives at `backend/app/agents/skill_gap_agent.py`
- Exposed via `POST /analyze/skill-gap`

### 2. Learning Agent
- Provider: **Groq**, model `openai/gpt-oss-120b`
- Builds a Learn → Practice → Build plan per skill gap.
- **No invented URLs**: the prompt restricts `learn_resources` / `practice_resources` to a candidate list pulled from `curated_resources.py` for that skill — the model can only copy `{title, url}` pairs from what it's given, never generate a link itself. Only `build_project` (a project idea, not a link) is freely generated.
- Lives at `backend/app/agents/learning_agent.py`
- Exposed via `POST /analyze/learning`

### 3. Supporting files
| File | Purpose |
|---|---|
| `backend/app/agents/curated_resources.py` | Loads `data/curated_resources.json`, does a forgiving lookup by skill name. Falls back to a **live YouTube search** (real, verifiable video URLs, not LLM-generated) for skills with no curated entry, caching results to `data/youtube_fallback_cache.json` so the same skill is never searched twice. |
| `backend/app/data/curated_resources.json` | Hand-curated Learn/Practice resources per skill |
| `backend/app/data/youtube_fallback_cache.json` | Disk cache for the YouTube fallback lookup |
| `backend/app/routes/analyze.py` | Added `/analyze/skill-gap` and `/analyze/learning` — merged into the existing router alongside `/ats`, `/jd`, `/match` |

### Route behavior
- Same pattern as the rest of `analyze.py`: agent-side failures (bad JSON, schema validation, rate limit, timeout) come back from `BaseAgent.run()` as `AgentResult(success=False, error=...)` and are turned into a **502** with the underlying error in `detail`.

---

## Issues hit and fixed

1. **Groq model retirement (recurring issue from Phase 5)** — the roadmap's original `llama-3.3-70b-versatile` for the Skill Gap Agent was already retired by Groq (Aug 16, 2026). Skipped straight to `openai/gpt-oss-120b` for both Skill Gap and Learning Agents from the start, rather than hitting the same failure twice.

---

## Confirmed working
- `/analyze/skill-gap` returns prioritized `gaps[]` with `skill`, `priority`, `suggested_projects` for a real Matching Agent output.
- `/analyze/learning` returns a `plan[]` with `learn_resources` / `practice_resources` pulled only from the curated catalog (or YouTube fallback), plus a scoped `build_project` per skill.
- End-to-end confirmed through the frontend (`SkillGapPlan.jsx`) with real resume/JD pairs — see `phase6_frontend.md`.

## Still to verify
- Same open item as `phase6_frontend.md`'s "Together" section: click through the actual Learn/Practice URLs across a handful of different skills to confirm none are dead/placeholder, and sanity-check that `suggested_projects` / `build_project` stay realistically scoped for a student rather than drifting into open-ended or production-scale ideas.