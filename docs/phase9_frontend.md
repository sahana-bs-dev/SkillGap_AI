# Phase 9 Frontend: History and Comparison

---

## ⚠️ READ FIRST: the History page shows SAMPLE data until the backend history API exists

The backend does **not** save analyses yet (`analyses_collection` exists in `db/mongo_client.py` but nothing writes to it) and has no `/api/history/*` routes. So the frontend was built against the API contract below.

**How the frontend behaves right now**

| Situation | What the person sees |
|---|---|
| `/api/history/analyses` or `/api/history/loops` returns **404** (route not built) | Example data plus a yellow banner: "Showing sample data…". Compare also works on the examples. |
| Route exists and returns data | Real data, no banner. **No code change or flag is needed.** |
| Route exists but fails (401, 500, server offline) | A real error message with "Try again". Sample data is never used to hide a real failure. |

**Resume versions are already real**: the Resume versions tab and version comparison use the existing `/api/resume/versions` endpoints.

**After the backend is done (cleanup):**
1. Delete `frontend/src/api/historyMock.js`.
2. In `historyApi.js` delete the `import { SAMPLE_ANALYSES, SAMPLE_LOOPS }` line, the `if (res.status === 404 || res.status === 405)` block, and the `sample` parameter of `fetchList`.

---

## What was built

All paths are under `frontend/src/`.

| File | Action | What it is |
|---|---|---|
| `pages/History/History.jsx` + `History.css` | new | `/history`: tabs for Analyses, Improvement loops, Resume versions; score-over-time chart with a per-job filter; tick two items to compare |
| `pages/Compare/Compare.jsx` + `Compare.css` | new | `/compare?type=analysis\|loop\|version&a=ID&b=ID` |
| `components/TrendChart.jsx` + `TrendChart.css` | new | Plain-SVG line chart (no chart library) |
| `api/historyApi.js` | new | `listAnalyses`, `listLoops` (with the 404 sample fallback above) |
| `api/historyMock.js` | new | Sample data (delete after integration) |
| `utils/historyStats.js` | new | Pure helpers: skill comparison, score change wording, job relation, loop summary, dates |
| `App.jsx` | edited | Two new protected routes: `/history`, `/compare` |

The sidebar already had a History link, so `Sidebar.jsx` is unchanged. Styles are scoped under `.hx-page` and need nothing from `global.css`.

## What the pages show

- **Analyses:** score-over-time chart (match and ATS), a job filter, and a warning when the chart mixes different jobs. Each card shows job, date, ATS and match scores, the change since the previous run of the same job, and expandable matched/missing skills.
- **Improvement loops:** start → best score, rounds, stop reason, and the round-by-round list (discarded rounds are tagged).
- **Resume versions:** the same cards as the Resume rewrite page.
- **Compare analyses:** a plain-language summary; earlier → later scores; skills Gained / Lost / Still missing / Still matched / Only in one job. **If the two analyses are for different jobs, a prominent warning explains the scores are not directly comparable** (roadmap edge case).
- **Compare loops:** both runs on one chart, a verdict, and a round-by-round table.
- **Compare versions:** side-by-side or highlighted word diff of the two rewritten resumes.
- The older item is always "Earlier", whichever order it was ticked in.

---

## API contract for the backend owner

All endpoints require the login token (`Authorization: Bearer …`) and return only the current user's data, newest first.

### `GET /api/history/analyses`

```json
[
  {
    "id": "665f1c…",
    "created_at": "2026-10-12T09:15:00+00:00",
    "flow": "resume_jd",
    "jd_title": "Backend Developer — Acme Corp",
    "jd_fingerprint": "a1b2c3d4",
    "ats_score": 72,
    "match_score": 64,
    "matched_skills": ["Python", "SQL"],
    "missing_skills": ["Docker", "Testing"]
  }
]
```

| Field | Notes |
|---|---|
| `flow` | `"resume_jd"` or `"resume_only"` |
| `jd_title` | Short label for the job. Can be derived from the JD (for example its first line) or entered by the user. `null` for resume-only. |
| `jd_fingerprint` | **Same JD text ⇒ same value** (for example a hash of the whitespace-normalised, lower-cased JD). This is how the page knows two analyses are for the same job. `null` for resume-only. If absent, the page falls back to comparing `jd_title`. |
| `ats_score`, `match_score` | Number or `null` |
| `matched_skills`, `missing_skills` | Arrays of skill **names** only (from `MatchingOutput`) |

### `GET /api/history/loops`

```json
[
  {
    "id": "665f2d…",
    "created_at": "2026-10-13T16:40:00+00:00",
    "jd_title": "Backend Developer — Acme Corp",
    "version_id": "665f2d…",
    "version_no": 5,
    "best_iteration": 2,
    "stop_reason": "Score improved by less than 3 points in round 2; the loop converged.",
    "iterations": [
      { "iteration": 0, "score": 55, "accepted": true, "remaining_gaps": ["Docker", "Testing"] },
      { "iteration": 1, "score": 63, "accepted": true, "remaining_gaps": ["Testing"] }
    ]
  }
]
```

`jd_title` and `version_id` may be `null`. `iterations` has the same shape the improvement-loop route already returns.

### Hints for the backend owner

- **Saving analyses:** `/analyze/match` currently has no login dependency and saves nothing. It needs `Depends(get_current_user)` and an insert into `analyses_collection` (resume text is not needed in the history list). `ats_score` comes from a separate request (`/analyze/ats`), so decide whether to store it on the same record (for example by matching the resume text within a short time window) or leave it `null`.
- **Loops:** the loop route already stores its result as a `resume_versions` document with `source: "improvement_loop"` and a `loop_iterations` list, so `/api/history/loops` can be built from those documents. `best_iteration` is not stored; derive it as the accepted iteration with the highest score. The stop reason is the second line of `diff_summary`. `jd_title` is not stored yet.
- **Resume versions:** nothing needed; the existing endpoints are used as they are.

---

## Checked

- Project builds; all frontend tests pass (32 in total, 17 new for this phase); the new files add no lint findings.
- Checked with mocked network calls: sample fallback on 404, real data with no banner, real errors not hidden, job filter, tick-two-then-compare, third tick replaces the oldest, different-job and same-job comparison, resume-only analysis, loop and version comparison, invalid links.
- **Not checked:** the pages against a real backend (the endpoints do not exist yet) and in a real browser. The chart was rendered to an image and looked correct.

## Integration checklist (frontend + backend together)

1. Backend serves `/api/history/analyses` and `/api/history/loops` as above.
2. Open `/history`: the yellow "sample data" banner must be gone.
3. Run two analyses of the same job: the trend chart shows both points and the card shows the change since the previous run.
4. Compare them: scores and gained/lost skills match what the Match report showed.
5. Compare two analyses of different jobs: the warning appears.
6. Run the cleanup steps at the top of this file.