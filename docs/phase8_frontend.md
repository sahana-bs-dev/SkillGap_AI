# Phase 8 Frontend: Agentic Improvement Loop
---

## ⚠️ READ FIRST: Mock data is still in the project

The loop page currently runs on **fake data**. The backend route does not exist yet, so a mock was added so the page could be built and tested.

| File | What it is | Action needed |
|---|---|---|
| `frontend/src/api/loopMock.js` | Returns fake loop results (two scenarios: `"improving"` and `"dropping"`) | **Delete on integration day** |
| `frontend/src/api/loopApi.js` | Contains `import { mockLoopResponse } from "./loopMock"`, the `USE_MOCK` flag, and the `if (USE_MOCK) return mockLoopResponse(...)` line | **Remove those three things on integration day** |

**Before pushing:** make sure `USE_MOCK = false` in `loopApi.js`. With it set to `true`, the page never calls the backend and always shows the fake scores (52 → 71 or 55 → 63 → 58), the fake final resume text (the short "SHOBITHA / Third-year engineering student" text) and the fake stop reasons. None of that is real output.

**On integration day:**
1. Set `USE_MOCK = false` (if not already).
2. Delete `loopMock.js`.
3. Remove the mock import, the `USE_MOCK` line, and the `if (USE_MOCK)` line from `loopApi.js`.
4. Run the full loop with the real backend (see "Integration checklist" below).

---

## What was built

All paths are under `frontend/src/`.

| File | Change |
|---|---|
| `api/loopApi.js` | **New.** `runImprovementLoop(resumeText, matchingOutput, gaps)` calls the loop route through the existing `apiRequest` from `apiClient.js`, so the token and 401 handling match the other API calls |
| `pages/ImprovementLoop/ImprovementLoop.jsx` | **New.** The loop dashboard page |
| `pages/ImprovementLoop/ImprovementLoop.css` | **New.** Styles. Reuses panel styles from `MatchReport.css` and tokens (`--gold`, `--match`, `--gap`) from `theme.css` |
| `App.jsx` | Added the `/improvement-loop` route inside `ProtectedRoute` |
| `Sidebar.jsx` | Added an "Improvement loop" link (step "06") |
| `ResumeRewrite.jsx` | Added a "Run improvement loop" button. It passes `resumeText`, `matchingOutput` and `gaps` to the loop page |

Notes on implementation:
- Plain JSX and a regular imported CSS file, no Tailwind.
- The chart is drawn as plain SVG, so no chart library is needed.
- Uses `for` loops, not `.map()`.
- The page starts the loop automatically when it opens, like the rewrite page does.
- If opened directly from the sidebar (no resume text in state), it shows a "Missing resume text" message instead of crashing.

---

## What the page shows

1. **Summary strip:** starting score to final score, net change, number of rounds, and the stop reason.
2. **Score by round:** an SVG line chart, Round 0 (original resume) through the last round, with labelled points.
3. **What changed each round:** one row per round with the score, the change from the previous round, and the number of gaps left.
4. **Before and after:** the original resume next to the final rewrite.
5. **Score-drop warning:** shown if a round's score falls compared to the previous one.

---

## How it was completed and checked

1. Built the page, CSS, API function, route, sidebar link and rewrite-page button from the Phase 8 spec.
2. Opened `/improvement-loop` directly from the sidebar: the page showed the "Missing resume text" message and did not crash.
3. Ran the full flow (Upload → Match → Skill gap → Rewrite → Run improvement loop). The request returned **404**, because the loop route does not exist in the backend. Confirmed at `http://127.0.0.1:8000/docs`: the `resume` group only has `/api/resume/rewrite`, `/api/resume/versions` and `/api/resume/versions/{version_id}`.
4. Added the mock (`loopMock.js` + `USE_MOCK` flag) so the page could be tested without the backend.
5. Tested the **"improving"** scenario (52 → 61 → 68 → 71): the summary strip, chart, round breakdown and before/after view all rendered correctly.
6. Tested the **"dropping"** scenario (55 → 63 → 58): checked that the score drop is handled.

---

## Assumptions that must be confirmed with the backend owner

These were guessed because the backend route did not exist when the frontend was built.

**Route:** `POST /api/resume/improvement-loop`  (constant `LOOP_PATH` in `loopApi.js`)

**Request body (current guess):**
```json
{
  "resume_text": "...",
  "matching_output": { "...same object /analyze/match returns..." },
  "gaps": [ "...same list /analyze/skill-gap returns..." ]
}
```
A `max_rounds` field is not sent yet. It should be added to both sides.

**Response the page expects:**
```json
{
  "iterations": [
    { "iteration": 0, "score": 52, "remaining_gaps": ["Docker", "Testing"] },
    { "iteration": 1, "score": 61, "remaining_gaps": ["Testing"] }
  ],
  "finished": true,
  "stop_reason": "Score improved by less than 5 points; loop converged.",
  "final_resume": "..."
}
```
- `iteration: 0` is the score of the **original** resume, before any rewrite.
- The page also tries `final_text` and `rewritten_text` if `final_resume` is missing.
- The original resume text comes from the page state, not from the backend.
- If the backend returns no final text, the "Final rewrite" pane shows a "not returned" message. Alternative: fetch it from `GET /api/resume/versions/{version_id}`.

**Stopping rule to agree on (backend):** stop when any of these is true: max rounds reached, score gain is below N points, score drops (keep the **best** version, not the last), or no gaps remain.

---

## Known small issues (fix before calling it finished)

- [ ] **Rounds count is off by one.** The summary strip shows `iterations.length` (4 for the improving mock) but the chart has 3 rewrite rounds, because Round 0 is the original. Change it to `iterations.length - 1`.
- [ ] **"Back to rewrite" button has an underline.** Add `text-decoration: none;` to that button's class (and its `:hover`) in `ImprovementLoop.css`.
- [ ] **Agent status lines look like plain text.** Compare with the Resume rewrite page. If that page styles them differently, match it. If they look the same there, leave it.
- [ ] **Confirm the round rows expand** to show the remaining gap names (the screenshot only showed the collapsed rows).

---

## Integration checklist (frontend + backend together)

- [ ] Backend route exists and appears in `/docs`; path and request fields match `loopApi.js`
- [ ] Response matches the shape above, including `final_resume`
- [ ] `USE_MOCK = false`, `loopMock.js` deleted, mock lines removed from `loopApi.js`
- [ ] Full flow works end to end: Upload → Match → Skill gap → Rewrite → Run improvement loop
- [ ] The score actually improves across rounds on a real resume
- [ ] The loop stops (converges) and shows a sensible stop reason
- [ ] The score-drop case is handled by the backend (best version kept) and the warning shows on the page
- [ ] Test with a thin resume: the rewrite must not invent skills or experience
- [ ] Check error states: backend returns 4xx/5xx, request times out, empty iterations