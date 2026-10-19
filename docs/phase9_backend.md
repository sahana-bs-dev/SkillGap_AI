# Phase 9 Backend: History and Comparison

Status: **Done and tested** (together with the frontend).

Phase 9 roadmap: the backend provides history APIs across analyses, resume versions and loop iterations. The frontend (History and Compare pages) was built by my friend against the contract below.

---

## 1. What was built

| Area | Result |
|------|--------|
| Saving analyses | Every `/analyze/ats` and `/analyze/match` run is saved to `analyses_collection` |
| Job identity | Each saved analysis has a `jd_title` and a `jd_fingerprint`, so the same job can be told apart from a different one |
| History API | `GET /api/history/analyses` and `GET /api/history/loops` |
| Loop history | Every improvement-loop run is recorded in a new `loop_runs` collection |
| Resume versions | Already served by `/api/resume/versions` (Phase 7), no change needed |
| ATS score | Now calculated in code, so the same resume always gives the same score |
| Auth | All history endpoints, `/analyze/ats` and `/analyze/match` require login |

---

## 2. Files added or changed

| File | Change |
|------|--------|
| `app/utils/history_utils.py` | New. `text_fingerprint`, `derive_jd_title`, `iso_utc` |
| `app/utils/ats_scoring.py` | New. `compute_ats_score` (deterministic ATS score) |
| `app/routes/history.py` | New. `GET /api/history/analyses` and `GET /api/history/loops` |
| `app/routes/analyze.py` | Updated. `/ats` and `/match` require login and save each run; ATS score computed in code |
| `app/routes/loop.py` | Updated. Saves every loop run to `loop_runs`, looks up the job title |
| `app/agents/ats_agent.py` | Updated. Prompt now asks only for issues; the model's `score` is ignored |
| `app/db/mongo_client.py` | Updated. Added `loop_runs_collection` and indexes |
| `app/main.py` | Registers the history router with `app.include_router(history.router)` |

---

## 3. Helpers (`app/utils/history_utils.py`)

- `text_fingerprint(text, length=8)`: lower-cases the text, collapses whitespace, and returns the first `length` characters of its SHA-256 hash. The same text with different spacing or case gives the same value. An edited sentence gives a different value, which is expected.
  - Used with length 8 for the job (`jd_fingerprint`) and length 16 for the resume (`resume_hash`).
- `derive_jd_title(jd_text, role_title)`: uses the JD Analysis Agent's `role_title` when available (up to 80 characters), otherwise the first non-empty line of the JD.
- `iso_utc(dt)`: MongoDB returns naive datetimes. This marks them as UTC so `.isoformat()` always ends in `+00:00`, which the frontend needs for sorting and labels.

---

## 4. Saving analyses (`app/routes/analyze.py`)

`_save_analysis(doc)` inserts a document into `analyses_collection` with a UTC `created_at`. It is wrapped in `try/except`, so a database problem never breaks an analysis the user already waited for.

### Saved document shape

```json
{
  "user_id": "string",
  "created_at": "UTC datetime",
  "flow": "resume_only | resume_jd",
  "resume_hash": "16-char fingerprint of the resume text",
  "jd_title": "string | null",
  "jd_fingerprint": "8-char fingerprint | null",
  "ats_score": "int | null",
  "match_score": "int | null",
  "matched_skills": ["skill names only"],
  "missing_skills": ["..."]
}
```

### `/analyze/ats`
- Requires login.
- Saves a `flow: "resume_only"` record with the ATS score.
- `jd_title`, `jd_fingerprint` and `match_score` are null.

### `/analyze/match`
- Requires login.
- Saves a `flow: "resume_jd"` record.
- `match_score` comes from `MatchingOutput.score`.
- `matched_skills` is reduced to skill names only (the model returns `{skill, evidence}`).
- `ats_score` is looked up with `_latest_ats_score(user_id, resume_hash)`, which finds the newest `resume_only` record for the same user and exact same resume text. If the ATS check was never run on that text, it stays null.

---

## 5. History endpoints (`app/routes/history.py`)

Both are scoped to the logged-in user (`user_id` filter), return newest first, and use `iso_utc` for dates.

### `GET /api/history/analyses`
Returns up to 200 records:

```json
[{
  "id": "string",
  "created_at": "2026-10-19T04:09:22.327000+00:00",
  "flow": "resume_only | resume_jd",
  "jd_title": "string | null",
  "jd_fingerprint": "string | null",
  "ats_score": 59,
  "match_score": null,
  "matched_skills": [],
  "missing_skills": []
}]
```

### `GET /api/history/loops`
Returns up to 100 loop runs:

```json
[{
  "id": "string",
  "created_at": "...",
  "jd_title": "string | null",
  "jd_fingerprint": "string | null",
  "version_id": "string | null",
  "version_no": 3,
  "best_iteration": 2,
  "stop_reason": "string | null",
  "iterations": [{ "iteration": 0, "score": 52, "accepted": true, "remaining_gaps": [] }]
}]
```

It merges two sources:
1. `loop_runs`: the current record of every run.
2. Legacy runs saved before `loop_runs` existed, read from `resume_versions` where `source == "improvement_loop"`. These are skipped if a `loop_runs` record already covers the same `version_id`, so nothing shows twice. Old `diff_summary` is a list; the "Stopped because: " prefix is removed from the stop reason.

---

## 6. Improvement loop recording (`app/routes/loop.py`)

- `_save_best_as_version` is unchanged. It still saves the best resume as a new version, and skips it when the original (iteration 0) was already best.
- `_record_loop_run` is new and runs after every loop, including runs where the original was already best. It stores `best_iteration`, `stop_reason`, `iterations`, `version_id` and `version_no` directly, so nothing has to be derived later. It never throws.
- `_find_job` fills `jd_title` and `jd_fingerprint`. The loop request does not carry the job, so it finds the user's newest `resume_jd` analysis with the same match score and missing skills. Best effort: it returns `(None, None)` when nothing matches.

---

## 7. ATS score fix

**Problem:** the ATS agent asked the LLM for a 0 to 100 score with no rubric, so a weak resume scored 95. After a first fix, subtracting points for LLM-reported issues made the same resume score differently between runs (59 then 54), because the model lists different issues each time.

**Fix:** the score is now calculated only in code by `compute_ats_score(text, llm_issues=None)`. The LLM still reports issues and suggestions for the report, but they do not affect the number. In `analyze_ats` the model's own score is overwritten:

```python
data = result.data.model_copy(
    update={"score": compute_ats_score(payload.resume_text, result.data.issues)}
)
```

Scoring starts at 100 and subtracts:

| Check | Points lost |
|-------|-------------|
| Missing Experience section | 15 |
| Missing Education section | 10 |
| Missing Skills section | 12 |
| Missing Projects section | 6 |
| No email address | 10 |
| No phone number | 5 |
| No LinkedIn or GitHub link | 3 |
| Fewer than 150 words | 25 |
| 150 to 299 words | 10 |
| More than 1200 words | 5 |
| Extraction artifacts (icon glyphs, broken characters) | 3 + count, max 15 |
| More than half the lines under 18 characters (column interleaving) | 8 |
| Fewer than 5 bullet points | 8 |
| Under 20% of bullets contain a number | 5 |

The result is clamped to 0 to 100. The same resume text always gives the same score. The weights are starting values and can be tuned.

---

## 8. Database (`app/db/mongo_client.py`)

New collection: `loop_runs_collection = db["loop_runs"]`

Indexes:
- `analyses`: `(user_id, created_at desc)` for the history list
- `analyses`: `(user_id, flow, resume_hash)` for the ATS-score lookup
- `loop_runs`: `(user_id, created_at desc)`

---

## 9. Testing done (with the frontend)

- The same job run twice gives the same `jd_fingerprint`, and the chart plots both points.
- Different jobs show the "not directly comparable" warning on the Compare page.
- Resume-only (ATS) runs appear in History as "Resume only".
- Compare page order is correct: the older run is "Earlier", the newer one is "Later".
- Same resume text gives the same ATS score on repeated runs.
- Loop runs appear in History, including runs where the original was already best.

---

## 10. Known limits

- `ats_score` on a "Resume + job" record is only filled if the ATS check ran first on the exact same resume text.
- A loop's job title is matched by exact score and missing skills, so it can be empty if the analysis was rerun with a different score.
- ATS records saved before the scoring fix still hold the old model-generated scores.
- ATS weights are heuristic and may need tuning against real resumes.

---

