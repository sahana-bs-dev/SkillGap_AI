# Phase 4 — Backend: ATS Agent

**Status:** ✅ Complete and verified end-to-end

**Scope (per roadmap):** ATS Agent (Groq) — detects formatting/parsing issues (tables, non-standard fonts, headers, missing sections), returns structured JSON score + suggestions.

---

## Tech / Packages Used

| Package | Purpose |
|---|---|
| `groq` | Official Groq SDK — used for the ATS Agent's LLM calls |
| `pydantic` | Validates the agent's JSON output against a strict schema before it ever reaches the frontend |

### Model note — deviation from the roadmap doc

The roadmap's model table lists `llama-3.1-8b-instant` for the ATS Agent. The implementation actually uses **`openai/gpt-oss-20b`** (set as `ATS_MODEL` in `ats_agent.py`). Same idea — a fast, high-quota Groq model for a formatting/pattern-check task that doesn't need heavy reasoning — but worth flagging so the roadmap doc and the code don't silently drift apart. If this was an intentional swap (quota, quality, or availability reasons), update the roadmap table to match; otherwise treat this as a bug to fix.

---

## Folder Structure Added

```
backend/app/
  agents/
    base_agent.py     — shared interface every specialist agent subclasses
    ats_agent.py       — ATS Agent implementation
    supervisor.py       — routing logic (built in Phase 3, referenced here)
  llm/
    groq_client.py      — thin wrapper around the Groq SDK
    schemas.py           — shared Pydantic schemas (extended in Phase 3)
  routes/
    analyze.py            — POST /analyze/ats
```

---

## Files Written and What Each Does

- **`app/llm/groq_client.py`** — `GroqClient.complete_json(model, prompt)`. Calls Groq's chat completions endpoint with `response_format={"type": "json_object"}` and a system prompt that forces JSON-only output (no markdown fences, no commentary). Parses the response with `json.loads`; raises a clear `ValueError` with a truncated preview of the raw output if Groq ever returns something that isn't valid JSON. This is the **only** file that imports the `groq` SDK — every agent goes through this wrapper, which is what makes a future model/provider swap a one-file change per the roadmap's isolation goal.

- **`app/agents/ats_agent.py`** — `ATSAgent(BaseAgent[ATSInput, ATSOutput])`. Implements `build_prompt()` only; all the calling/validation/error-handling logic is inherited from `BaseAgent` (built in Phase 3). The prompt instructs the model to judge ATS-friendliness purely from the extracted plain text — no job description involved, since this is the resume-only route. It explicitly asks the model to look for: multi-column/table artifacts, missing standard sections, non-standard section headers, broken characters from image/graphic content, buried contact info, and sparse content. The model is told to return a clean/high score with empty issues rather than inventing problems on a genuinely clean resume.

- **`app/llm/schemas.py`** *(ATS portion)* — `ATSInput` (`resume_text: str`), `ATSIssue` (`category`, `severity`, `message`), `ATSOutput` (`score: int` 0–100, `issues: list[ATSIssue]`, `suggestions: list[str]`). `BaseAgent.run()` validates the raw Groq JSON against `ATSOutput` before it's ever trusted — a malformed or hallucinated shape fails cleanly as `AgentResult(success=False, error=...)` instead of reaching the frontend.

- **`app/routes/analyze.py`** — Defines `POST /analyze/ats`. Rejects empty `resume_text` with a `400`. Constructs one shared, stateless `ATSAgent` instance at module load (no per-request construction needed since `.run()` carries no state between calls). On agent failure, returns a `502` with the underlying error message rather than a generic 500 — makes Groq-side failures (bad JSON, rate limit, timeout) distinguishable from a client-input problem.

---

## Endpoint Implemented

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/analyze/ats` | Runs the ATS Agent on parsed resume text, returns `{ score, issues, suggestions }` |

Called by the Supervisor's resume-only route (`app/agents/supervisor.py`'s `build_pipeline()` → `[AgentName.ATS]`), and directly by the frontend's `runATSAnalysis()`.

---

## Testing Done

- Ran the endpoint against a clean, well-formatted resume — confirmed a high score and an empty/near-empty `issues` array rather than invented problems.
- Ran it against a two-column/table-based resume — confirmed formatting issues were flagged with sensible `category`/`severity` values.
- Ran it against an image-heavy resume (garbled extracted text) — confirmed parsing artifacts were caught and flagged as `high` severity.
- Confirmed the `400` path for empty `resume_text` and the `502` path when the LLM response fails schema validation.
- Confirmed the full round trip with the frontend (`ATSReport.jsx`) — score, issues, and suggestions render correctly end-to-end.

---

## Known Quirks / Notes for Next Time

- **Model mismatch with the roadmap doc** — see the note above (`openai/gpt-oss-20b` vs. the documented `llama-3.1-8b-instant`). Reconcile one way or the other so Phase 6+ agents aren't copied from a stale reference.
- The ATS Agent never sees the JD — that's intentional and matches the roadmap's routing (`RouteType.RESUME_ONLY → [ATS]` only). Don't be tempted to pass `jd_text` in here even if it's available; that would blur the resume-only vs. resume+JD distinction the Supervisor is built around.
- `ats_agent = ATSAgent(...)` is instantiated once at module import time in `analyze.py`, not per-request — fine since the agent is stateless, but if the agent ever gains per-request state (e.g. caching), this pattern would need revisiting.

---