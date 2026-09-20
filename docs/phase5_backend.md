# Phase 5 — Backend (JD Analysis Agent + Matching Agent)

**Status:** Code complete, tested end-to-end via `/analyze/jd` and `/analyze/match`. Evidence-hallucination spot check on real resume/JD pairs still pending (see "Still to verify" below).

---

## What was built

### 1. JD Analysis Agent
- Provider: **Groq**
- Extracts required / preferred / implicit skills from a job description.
- Lives at `backend/app/agents/jd_analysis_agent.py`
- Exposed via `POST /analyze/jd`

### 2. Matching Agent
- Provider: **Gemini**
- Scores a resume against a JD analysis and returns matched skills, missing skills, per-skill evidence, and a relevant-experience summary.
- Highest hallucination risk in the pipeline (after Resume Rewrite) — the prompt explicitly instructs the model to prefer `missing_skills` over inventing evidence whenever it's unsure.
- Lives at `backend/app/agents/matching_agent.py`
- Exposed via `POST /analyze/match` (internally re-runs JD analysis rather than reusing a cached one — fine for now, worth revisiting once Supervisor/pipeline wiring exists so you're not paying for two Groq calls per match request)

### 3. Supporting files
| File | Purpose |
|---|---|
| `backend/app/llm/groq_client.py` | Thin wrapper around Groq's chat completions API, forces JSON-only output via system prompt + `response_format={"type": "json_object"}` |
| `backend/app/llm/gemini_client.py` | Thin wrapper around Gemini (`google-genai` SDK), forces JSON-only output via `response_mime_type="application/json"` |
| `backend/app/llm/schemas.py` | Shared Pydantic schemas (`JDAnalysisInput/Output`, `MatchingInput/Output`, `AgentResult`, etc.) — merged into existing file from Phase 3/4 |
| `backend/app/routes/analyze.py` | Routes for `/analyze/ats`, `/analyze/jd`, `/analyze/match` — merged into existing file |
| `backend/app/agents/base_agent.py` | Shared `BaseAgent` interface (already existed from Phase 3) — every agent's `run()` wraps prompt building + LLM call + schema validation, and never raises; failures come back as `AgentResult(success=False, error=...)` |

### Route behavior
- `/analyze/jd` and `/analyze/match` validate required text fields up front → **400** on empty input.
- Any agent-side failure (bad JSON, schema validation failure, rate limit, bad model name, timeout) → **502** with the underlying error message in `detail`, so client-input problems and provider-side problems are always distinguishable.

---

## Issues hit and fixed

1. **Groq model retirement** — `llama-3.3-70b-versatile` (used by JD Analysis Agent) was deprecated and shut down by Groq on Aug 16, 2026.
   → Fixed by switching `JD_ANALYSIS_MODEL` to `openai/gpt-oss-120b` (Groq's recommended replacement, and the same model already used by the Learning Agent per the roadmap).

2. **Gemini invalid model name** — `MATCHING_MODEL` was set to `"gemini-3-flash"`, which isn't a real model ID (Gemini 3 Flash is versioned: `gemini-3.5-flash`, `gemini-3.6-flash`, `gemini-3.7-flash`, or the preview tag `gemini-3-flash-preview`). The bad string caused a 404 from Gemini, which `BaseAgent.run()` caught and surfaced as a 502 from `/analyze/match`.
   → Fixed by switching `MATCHING_MODEL` to `gemini-3.7-flash` (current stable Flash model as of Aug 2026).

3. Two rounds of stale/mismatched file versions during copy-paste (old function-based `matching_agent.py` vs the class-based `BaseAgent` version) — resolved by doing a full select-all-replace on the file instead of patching in place.

---

## Confirmed working
- `/analyze/jd` returns structured required/preferred/implicit skills.
- `/analyze/match` returns `score`, `matched_skills` (with evidence), `missing_skills`, and `relevant_experience` for a real resume/JD pair.

## Still to verify
- Run 2–3 more real resume/JD pairs through `/analyze/match` and manually check that every string in `evidence[]` is actually traceable to the resume text (not fabricated) — the whole point of the no-fabrication instruction in the Matching Agent's prompt. Not yet done.

---

