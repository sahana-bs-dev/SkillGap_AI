# SkillGap AI — Work after Phase 9, and what is left

This document covers everything done after Phase 9 (History and Compare), plus the items still open.
All code below was written in chat and handed over as complete file replacements. None of it was run
by the assistant, so every item in the checklist at the end still needs a real test on your machine.

---

## 1. Summary

| Area | Problem found | Fix |
|---|---|---|
| ATS score | Model invented the number, so a weak resume could score 95 | Score is now computed in code; the model only reports issues |
| Match score | Same job gave different skill lists and the score did not follow the counts | JD analysis is cached and normalized; score is computed in code from matched and missing skills |
| Improvement loop | Round 1 scored 0 and every round was discarded | Loop re-scores with the same code-based score as the Match report |
| Mobile layout | Fixed sidebar and wide layouts broke on phones | Top bar plus bottom tab bar, and mobile rules in the shared and page CSS |
| Empty and error states | Pages showed internal agent text and raw errors to users | Shared friendly empty state; agent strip shown only while a run is active |

---

## 2. Scoring fixes (backend)

### 2.1 ATS score computed in code

- `app/utils/ats_scoring.py` has `compute_ats_score(text, llm_issues)`.
- Deductions: missing standard sections, missing contact details, very short or very long resumes,
  extraction junk characters, many very short lines (column-interleaving sign), too few bullets or
  bullets without numbers, and the severity of issues the model found (capped at 25 points).
- In `/analyze/ats` the model's own `score` is ignored and replaced with the computed one.
- In `/analyze/match` the same function is used, called as `compute_ats_score(resume_text, [])`, so
  every saved match record also has an ATS score.
- The weights are starting guesses and need calibration (see section 6).

### 2.2 Match score computed in code

- New file `app/utils/match_scoring.py` with two functions.
  - `normalize_jd_analysis(jd)`: removes empty and duplicate skills, keeps each skill in only one
    list, caps the lists (12 required, 8 preferred, 5 implicit) and sorts them alphabetically.
  - `apply_match_score(output, jd)`: rebuilds the matched and missing lists from the JD lists. A skill
    counts as matched only if the model returned it with non-empty evidence. The score is the weighted
    share of matched skills: required weighs 6, preferred 3, implicit 1.
- `app/agents/matching_agent.py`: the model now judges every JD skill, copies skill names exactly, and
  returns `"score": 0` on purpose. The real score comes from `apply_match_score`.
- `app/agents/jd_analysis_agent.py`: stricter prompt (no soft traits, canonical names, caps, sorted
  lists, required vs preferred rules).

### 2.3 JD analysis cache

- `app/routes/analyze.py` (full replacement) has `_get_jd_analysis(jd_text)`.
- The result is cached in a new MongoDB collection `jd_cache` in the same database as
  `analyses_collection`. Document shape: `_id` is the JD fingerprint, `analysis` is the normalized JD
  analysis, `created_at` is the time it was stored.
- The same JD text therefore always gives the same skill list. Cache read or write problems never
  break a request.
- `/analyze/jd` also goes through the cache.

### 2.4 Improvement loop

- `app/orchestration/improvement_loop.py` (full replacement):
  - Round 0 is scored with `apply_match_score`, the same way as every later round.
  - Each re-match result also goes through `apply_match_score`, so the model's `0` is never shown.
  - `jd_from_matching` is now only a fallback.
- The improvement-loop route file (starts with `POST /api/resume/improvement-loop`, full replacement):
  - `_find_job` finds the user's saved analysis, which gives the JD fingerprint.
  - `_load_jd_analysis` loads the real JD analysis from `jd_cache`, so required, preferred and implicit
    skills keep their weights. If it is not found, the loop falls back to a flat list where every
    skill counts as required.
  - The JD title and fingerprint are reused when the loop run is saved to `loop_runs`.

---

## 3. Mobile responsiveness (frontend)

Breakpoint everywhere: `max-width: 768px`.

- `Sidebar.jsx` and `Sidebar.css`
  - Desktop: unchanged side rail.
  - Phone: slim top bar with the brand, a fixed bottom tab bar, and a "More" sheet.
  - Tabs: Home, New, Match, Skill gap, More. The More sheet holds ATS report, Resume rewrite,
    Improvement loop, History, Compare, the user email and Log out.
  - The sheet closes on page change, on tapping outside it, and when the screen grows to desktop size.
  - `.shell` gets top and bottom padding on phones so content is never hidden behind the bars.
  - `NAV_ITEMS.map()` was replaced by plain link calls, to follow the no-`.map()` preference.
- `src/index.css` and `src/styles/global.css`: same mobile block in both, covering smaller headings,
  stacked page headers, tighter panels, wrapping score block and list rows, one-column `grid-2`, and a
  guard against sideways scrolling.
- `Dashboard.css`: stat cards in two columns (one below 380px), stacked recent rows, full-width quick
  action buttons.
- `Upload.css`: one-column resume and job description boxes, small Analyze button, and 1rem side
  padding so nothing hugs the left edge.

---

## 4. Friendly empty and error states (frontend)

- New shared component `src/components/EmptyState/EmptyState.jsx` and `EmptyState.css`.
  Props: `title`, `message`, `actionLabel`, and either `actionTo` (link) or `onAction` (button).
- Pages updated: `ATSReport.jsx`, `MatchReport.jsx`, `SkillGapPlan.jsx` (skill gap page) and
  `ImprovementLoop.jsx`.
- New `empty` status: shown when the page is opened without data, with a "Start a new analysis" button.
- Errors: the user sees a friendly message with a "Try again" button. The raw error is only logged to
  the browser console.
- The agent strip ("Supervisor Agent — routed" and so on) shows only while a run is in progress or
  finished. It never appears on empty or failed pages.
- ATS report: the "Matching Agent — not run (no JD)" chip was removed.
- Match report: the "View skill gap & plan" button now shows only when a report exists. Before, it
  passed an empty report to the next page.
- `.map()` rendering replaced by plain loops on these pages.

---

## 5. Files changed or added

| File | Status |
|---|---|
| `app/utils/ats_scoring.py` | new |
| `app/utils/match_scoring.py` | new |
| `app/agents/matching_agent.py` | replaced |
| `app/agents/jd_analysis_agent.py` | replaced |
| `app/routes/analyze.py` | replaced |
| `app/orchestration/improvement_loop.py` | replaced |
| improvement-loop route file | replaced (keep its original name and location) |
| `src/components/Layout/Sidebar.jsx` and `Sidebar.css` | replaced |
| `src/index.css` and `src/styles/global.css` | replaced |
| `Dashboard.css` and `Upload.css` | replaced |
| `src/components/EmptyState/EmptyState.jsx` and `.css` | new |
| `ATSReport.jsx`, `MatchReport.jsx`, `SkillGapPlan.jsx`, `ImprovementLoop.jsx` | replaced |

---

## 6. Leftover

### Pages and UI
- [ ] `ResumeRewrite.jsx`: not seen yet. Probably shows the same developer-facing empty state. Needs
      the EmptyState treatment and mobile check.
- [ ] Dashboard, History and Compare pages: check their empty states for technical text.
- [ ] Mobile CSS still missing for `MatchReport.css`, `ImprovementLoop.css` (the loop summary, the
      before and after panes, round rows), History and Compare CSS, and the Resume rewrite CSS.
- [ ] Decide whether to hide the agent strip everywhere, even while loading, and show a simple
      progress message instead.
- [ ] Test on a real phone. Make sure `index.html` has
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">`.

### Backend checks
- [ ] Restart the backend, then run the same resume and JD twice through `/match`. The skill counts and
      the score should be identical both times.
- [ ] Run the improvement loop after a fresh `/match`. Round 0 should equal the Match report score,
      and Round 1 should show a real number, not 0.
- [ ] Confirm the improvement-loop route file was replaced under its original name, not saved as a
      second file.
- [ ] `app/agents/ats_agent.py`: delete the sentence "If the resume looks clean, return a high score".
      The docstring also still says `llama-3.1-8b-instant` while `ATS_MODEL` is `openai/gpt-oss-20b`.
- [ ] Analyses saved before these changes have no cached JD analysis. The loop falls back to a flat
      skill list for them, so round 0 may differ slightly from the old Match report. Re-run the match
      to refresh.

### Tuning
- [ ] Calibrate ATS weights with one resume you consider about 30 and one about 80.
- [ ] Tune the match weights (6, 3, 1) and caps (12, 8, 5) if scores feel too harsh or too generous.
- [ ] Optional: clean up old `jd_cache` documents, for example with a TTL index on `created_at`.

---

## 7. Decisions worth remembering

- The model decides which skills have evidence. Code decides every number.
- A skill is matched only if it comes back with real evidence text.
- Same JD text means same skill list, through the cache.
- Users never see agent names, raw errors, or backend messages on empty or failed pages.
- Plain JSX, regular imported CSS files, no Tailwind, no CSS Modules, no `.map()` in rendering.