# Phase 7 — Resume Rewrite Agent + Versioning (Frontend)

**Status:** Frontend complete and confirmed working end-to-end against a real backend response. Backend (Resume Rewrite Agent, `/rewrite/resume`, version storage) is Friend's part — see "Backend note" below.

---

## Scope

Per the roadmap:
> You (Frontend): Rewrite preview with diff view, version history list.

Build the **Resume Rewrite** page, consuming `POST /rewrite/resume` and rendering the rewritten resume, a diff summary, and any fabrication warnings.

## What was built

| Item | Details |
|---|---|
| Page | `pages/ResumeRewrite/ResumeRewrite.jsx` (reuses `MatchReport.css` panel/row-list styles — no separate CSS file needed) |
| API client | `api/rewriteApi.js` — `runResumeRewrite(resumeText, matchingOutput, gaps)`, calls `POST /rewrite/resume`, same error-handling shape as `analyzeApi.js` |
| Routing | Registered `/resume-rewrite` in `App.jsx` under `ProtectedRoute` |
| Sidebar | Added "Resume rewrite" nav item |

## Bugs found and fixed

1. **State not threaded through the page chain.** `resumeText` was being dropped between Match Report → Skill Gap, and Skill Gap → Resume Rewrite had no `state` at all, so the rewrite page would always load with nothing to send. Fixed by:
   - `MatchReport.jsx`: both `<Link to="/skill-gap">` calls now pass `resumeText` alongside `matchingOutput`
   - `SkillGapPlan.jsx`: reads `resumeText` from `state`, forwards `resumeText`, `matchingOutput`, and its own `gaps` to `<Link to="/resume-rewrite">`

2. **`App.jsx` had a duplicate `SkillGapPlan` import** and already referenced `ResumeRewrite.jsx` before that file existed — this broke the dev server compile entirely. Fixed by removing the duplicate import line and creating the missing page.

3. **Dead sidebar link.** `Sidebar.jsx` had a `/learning-plan` nav item pointing at a page/route that never existed (Learning Plan is rendered inside `SkillGapPlan.jsx`, not as its own page). Removed the entry and renumbered the remaining steps (03 → 04, was 03 → 05).

## Known limitation (not a bug — expected until Phase 9)

Sidebar links to `/match-report`, `/skill-gap`, and `/resume-rewrite` only render real content if reached via the in-flow buttons (`<Link state={{...}}>`), because these pages currently source their data entirely from React Router `state`, not from a fetch-by-ID. Clicking them directly from the sidebar, or refreshing/loading the URL directly, shows the "run a match first" empty state instead of a crash — this is correct, not broken.

**Real fix belongs to Phase 9 (History):** once analyses are persisted with an ID (Friend's backend work), these pages should fetch by `analysisId` instead of relying on in-memory state, making every sidebar link independently loadable.

## Backend note

`resume_rewrite_agent.py`, `routes/rewrite.py`, and the `main.py` router registration were drafted to unblock frontend testing (see chat log) but are **Friend's part per the roadmap** (Phase 7: Friend = Backend). These were shared as a reference/starting point only, not merged — Friend owns the final prompt design, model choice, and no-fabrication guardrails, and should review/replace before this ships. One issue already caught and flagged to Friend: the draft used the invalid model string `"gemini-3-flash"` (same bug from Phase 5's Matching Agent) — corrected to `"gemini-3.7-flash"`.

## Verification — Frontend

- [x] `/resume-rewrite` compiles and renders (post duplicate-import fix)
- [x] Confirmed `resumeText` / `matchingOutput` / `gaps` all arrive correctly via `state` when reached through the real flow (verified via a real `404 Not Found` network call before the backend route existed — proved the payload was firing correctly, not mocked)
- [x] Confirmed real end-to-end response after backend route was added (normal resume/JD pair — Data Analyst role)
- [ ] **Adversarial thin-resume test not yet done** — roadmap's own Key Risk Notes flag Resume Rewrite as the highest fabrication risk in the system, specifically with sparse resumes. A thin test pair was handed off for this but result not yet confirmed back in this session.

## Verification — Together (per roadmap, still open)

> "Together: Adversarially test with thin resumes to catch any fabrication before moving on."

- [ ] Run the thin-resume test pair (2-3 line resume) through the full pipeline and manually check the rewritten output for any invented project, employer, tool, or metric not present in the original — should show up in `warnings` instead, never silently in `rewritten_text`
- [ ] Confirm resume version storage in MongoDB (Friend's backend scope, not yet started — no `db/models.py` / `db/history.py` exist yet)

**Phase 7 is not considered fully closed until the adversarial test and version storage are done**, even though the frontend rewrite/diff view itself is functionally complete.