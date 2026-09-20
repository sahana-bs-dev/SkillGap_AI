# Phase 5 — Frontend: Match Report

**Status:** ✅ Frontend complete and verified in isolation — ⚠️ **blocked on backend** (`POST /analyze/match` doesn't exist yet)

**Scope (per roadmap):** Match Report page — score, matched/missing skills, evidence per match, relevant experience section.

---

## What was built (frontend — piece)

### 1. `pages/MatchReport/MatchReport.jsx`
Replaces the Phase 3 placeholder (which only echoed back `resumeText`/`jdText` character counts) with the real report:
- Reads both `resumeText` and `jdText` from router state, passed by the Upload page's `navigate("/match-report", { state: { resumeText, jdText } })`
- Calls `runMatchAnalysis(resumeText, jdText)` on mount
- Renders three states: `loading`, `error`, `done` — same pattern as `ATSReport.jsx` from Phase 4
- On success, renders:
  - `ScoreRing` with `variant="match"` (green fill, reused as-is from Phase 4 — no changes needed there)
  - **Matched skills** panel — each entry shows the skill name and its evidence excerpt from the resume, tagged "matched"
  - **Missing skills** panel — flat list, tagged "missing"
  - **Relevant experience** panel — freeform bullets from the agent
  - A callout linking forward to `/skill-gap` (Phase 6)
- `AgentStatusIndicator` shows a three-step strip (Supervisor Agent → JD Analysis Agent → Matching Agent) whose `status`/`label` per step reacts to the page's own loading/done/error state — same dual-mode component built in Phase 3/4, no changes needed.

### 2. `pages/MatchReport/MatchReport.css` *(new file)*
Page-specific styling — the only genuinely new file this phase; everything else was a content update to an existing file.

### 3. `api/analyzeApi.js`
Added `runMatchAnalysis(resumeText, jdText)` — `POST /analyze/match` with `{ resume_text: resumeText, jd_text: jdText }`. Expects back `{ score, matched_skills: [{skill, evidence}], missing_skills, relevant_experience }`, matching the `MatchingOutput` schema already defined in the backend's `llm/schemas.py` (built in Phase 3 ahead of the agent that will actually populate it). `runATSAnalysis` from Phase 4 is untouched.

### 4. `components/ScoreRing.jsx`, `components/Layout/Sidebar.jsx`, `components/AgentStatus/AgentStatusIndicator.jsx`
No changes required — all three were already built generically enough in Phases 3–4 to be reused here as-is. Confirms the shared-component approach from earlier phases is paying off.

---

## Backend dependency — not yet available

This is the frontend half of Phase 5 only. The backend half (per the roadmap: JD Analysis Agent on Groq, Matching Agent on Gemini) has not been built yet:

- No `app/agents/jd_analysis_agent.py`
- No `app/agents/matching_agent.py`
- No `app/llm/gemini_client.py` (the `llm/` folder currently only has `groq_client.py` from Phase 4)
- No `/analyze/match` route registered in `routes/analyze.py`

**Confirmed behavior right now:** running the "resume + job description" flow correctly routes to `/match-report`, `AgentStatusIndicator` correctly shows "JD Analysis Agent — complete" then "Matching Agent — failed", and the page cleanly surfaces the network error:

```
Match analysis failed (404): {"detail":"Not Found"}
```

This is the frontend's error-handling path working as designed against a route that legitimately doesn't exist yet — not a frontend bug. Nothing on this page needs to change once the backend route ships; the response shape it already expects (`score`, `matched_skills[].{skill,evidence}`, `missing_skills`, `relevant_experience`) matches `MatchingOutput` in `llm/schemas.py` exactly, so this should be a drop-in connection once `/analyze/match` exists.

---

## Testing Done

- Confirmed Upload → "Resume + job description" mode correctly navigates to `/match-report` with both `resumeText` and `jdText` present in router state.
- Confirmed the loading state renders immediately and the agent-status strip reflects "JD Analysis Agent — running…" / "Matching Agent — running…" appropriately.
- Confirmed the error state renders correctly against the current (expected) 404 from the missing backend route — verified in DevTools Console/Network as `GET/POST :8000/analyze/match` → `404 Not Found`.
- Confirmed the success-state rendering logic (matched/missing skills, evidence, relevant experience, score ring) against a hand-crafted mock response shaped like `MatchingOutput`, since the real endpoint isn't live yet.

---

## Known Quirks / Notes for Next Time

- **This page cannot be verified end-to-end until the backend's Phase 5 half ships.** Don't treat the 404 as a regression if it shows up again later — it's expected until `jd_analysis_agent.py`, `matching_agent.py`, `gemini_client.py`, and the `/analyze/match` route all exist.
- The frontend's mocked-response testing assumed `MatchingOutput`'s exact field names (`matched_skills`, `missing_skills`, `relevant_experience`, `score`) — if the backend agent's actual output schema drifts from `llm/schemas.py` during implementation, this page will need a corresponding update.
- Per the roadmap's key risk notes, the Matching Agent's evidence citations are the second-highest hallucination risk in the system — once wired up, this page is exactly where that needs to be spot-checked (confirm each `evidence` string is actually present in the source resume, not invented).

---