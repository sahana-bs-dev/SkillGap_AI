# Phase 8 — Backend (Agentic Improvement Loop)

**Status:** Code complete. The loop controller and its route are built and registered in `main.py`. The frontend half (loop dashboard) is in `phase8_frontend.md` and is already wired to this route (mock removed). This document was written from reading the code. The loop has not been re-run for this write-up, so the "Still to verify" list below is open until you run it.

---

## Packages installed

No new packages in Phase 8. The loop reuses what earlier phases already installed:

| Package (pip name) | Used for |
|---|---|
| `fastapi`, `pydantic` | The loop route and its request/response models |
| `google-genai` | Gemini client, used by the Resume Rewrite Agent inside each round |
| `groq` | Groq client, used by the Matching and Skill Gap agents inside each round |
| `pymongo` | Saving the best result into `resume_versions` |
| `python-jose`, `passlib` | JWT auth (`get_current_user`) on the route |

---

## What was built

### 1. Loop controller
- File: `backend/app/orchestration/improvement_loop.py`
- Class: `ImprovementLoopController(registry, supervisor=None)`, method `run(resume_text, jd_analysis, matching_output, gaps, max_rounds)`
- Returns a `LoopResult` (extends `LoopState`).

**One round** = Resume Rewrite → fabrication check → re-run Matching → log the score → decide → (if continuing) re-run Skill Gap.

```
Round 0: original resume's score (taken from the match you pass in, no model call)
Round N: Rewrite -> guard vs ORIGINAL -> Match -> decide -> Skill Gap -> next round
```

**Guarantees**

| Guarantee | How |
|---|---|
| Round 0 is the original's score | Built from the incoming `matching_output`, no extra call |
| No slow fabrication drift | Each rewrite is checked against the **original** resume (not the previous round) using the Rewrite Agent's own `_find_violations()` |
| Final resume is the **best** clean round | `best_resume` / `best_round` tracked; the last round is never assumed to be best |
| If nothing beats the original | The original is returned unchanged and `best_iteration = 0` |
| Same skill list every round | `jd_from_matching()` rebuilds the JD skills (matched + missing) once, so scores are comparable between rounds and one JD-analysis call per round is saved |

### 2. Stopping conditions
The first one that is true wins.

| # | Condition | Result |
|---|---|---|
| 1 | No gaps remain at the start (or after a round, via Supervisor) | Stop, nothing left to improve |
| 2 | An agent call fails (rewrite, re-match or skill gap) | Stop, keep the best result so far |
| 3 | The round added content not in the original (guard violations) | Round recorded as `accepted: false`, **discarded**, loop stops |
| 4 | Score dropped versus the previous round | Round recorded as `accepted: false`, **discarded**, loop stops |
| 5 | Supervisor says stop (`should_continue_loop`: no remaining gaps, or safety cap `MAX_LOOP_ITERATIONS = 5`) | Stop |
| 6 | Score gain is below `MIN_SCORE_GAIN = 3` | Stop, **converged** (the round is still accepted if the score did not drop) |
| 7 | `max_rounds` reached | Stop |

Constants: `DEFAULT_MAX_ROUNDS = 3`, `MIN_SCORE_GAIN = 3`. `max_rounds` is clamped to `1..MAX_LOOP_ITERATIONS` inside `run()`, and the route also limits it to `1..5`.

### 3. Result shape
`LoopResult` = `LoopState` + extras:

| Field | Meaning |
|---|---|
| `iterations[]` | One entry per round, **including round 0** |
| `iterations[].iteration` | 0 = original, 1..N = rewrite rounds |
| `iterations[].score` | Matching score for that round |
| `iterations[].remaining_gaps` | Missing skills after that round |
| `iterations[].accepted` | `false` if the round was discarded (score drop or fabrication) |
| `iterations[].warnings` | Guard findings, worded `Not found in your original resume: <item>` |
| `finished` | `true` when the loop stopped |
| `stop_reason` | Plain-language reason, first letter capitalised |
| `original_resume`, `final_resume` | Text for the before/after view |
| `best_iteration` | Round that produced `final_resume` (0 = original was best) |
| `max_rounds` | The cap actually used |

### 4. Route
- File: `backend/app/routes/loop.py`
- Registered in `main.py` with `app.include_router(loop_router)`
- Router prefix `/api/resume`, so it sits in the same group as the rewrite and version routes.

**`POST /api/resume/improvement-loop`** (requires login, JWT bearer)

Request:
```json
{
  "resume_text": "...",
  "matching_output": { "...same object /analyze/match returns..." },
  "gaps": [ "...same list /analyze/skill-gap returns..." ],
  "max_rounds": 3
}
```
- `gaps` defaults to `[]`; `max_rounds` defaults to 3 (allowed 1–5).

Response: the `LoopResult` fields above plus `final_version_id` and `final_version_no` (both `null` when nothing was saved).

Errors: **400** if `resume_text` is empty. **401** from the auth dependency. Agent failures do **not** raise an error; they end the loop with a `stop_reason` and the best result so far is returned with a normal 200.

### 5. Agents and models used inside the loop
Same agent objects and models the other routes use (nothing new to configure):

| Agent | Provider | Model constant |
|---|---|---|
| Resume Rewrite | Gemini | `REWRITE_MODEL` |
| Matching | Groq | `MATCHING_MODEL` (`openai/gpt-oss-20b`) |
| Skill Gap | Groq | `SKILL_GAP_MODEL` |

### 6. Saving the best version
`_save_best_as_version()` stores the loop's best resume in `resume_versions`, so it appears in the normal version history next to ordinary rewrites.

- **Skipped** when `best_iteration == 0` (the original was already best, so `final_version_id` is `null`).
- **Never throws away the result:** a database error is printed (`[loop] could not save version`) and the loop result is still returned.
- `version_no` = number of the user's existing versions + 1.

Saved document (extends the Phase 7 fields):

| Field | Value |
|---|---|
| `user_id`, `version_no`, `created_at` | As in Phase 7 |
| `parent_version_id` | `null` |
| `original_text` | The resume sent in |
| `rewritten_text` | The best round's text |
| `diff_summary` | Two lines: "Improvement loop: best result from round N (scores a to b to c)." and "Stopped because: …" |
| `warnings` | `[]` |
| `source` | `"improvement_loop"` (new) |
| `loop_iterations` | The full `iterations` list (new) |

The `source` and `loop_iterations` fields are what Phase 9's `/api/history/loops` can be built from.

---

## Configuration

No new environment variables. The loop uses the existing `GEMINI_API_KEY` / `GEMINI_API_KEY_2`, the Groq key, `MONGO_URI` / `MONGO_DB_NAME` and the JWT settings. `.env` changes only load on a fresh uvicorn start, not on auto-reload.

---

## Design decisions (and why)

1. **Keep the best round, not the last.** A later round can score lower. Returning the last one would make the loop look like it made things worse.
2. **Check against the original, not the previous round.** A fabricated skill that slips into round 1 would otherwise count as "already in the resume" from round 2 onwards.
3. **Discard and stop on a fabrication or a score drop.** Continuing from a bad round would build on bad text.
4. **Reuse one skill list.** Re-running JD Analysis each round would add score noise unrelated to the rewrite.
5. **Skill Gap re-enters after each round.** This is the repeat edge from the roadmap diagram (`next_loop_step()` returns `SKILL_GAP`), so each rewrite targets the gaps that are still open.
6. **A failed agent call ends the loop but returns a normal response.** Minutes of earlier model work are not lost.

---

## Still to verify

These are the "Together" items from the roadmap and have not been confirmed in this write-up:

- [ ] Run the loop end to end on a real resume and JD (Upload → Match → Skill gap → Rewrite → Improvement loop) and check the score actually improves across rounds.
- [ ] Confirm the loop **converges** and the stop reason shown on the dashboard is sensible.
- [ ] Force the score-drop case and the fabrication case and confirm the round shows `accepted: false` and the earlier best resume is returned.
- [ ] Run it on a thin resume and read the final text by hand for invented content (the guard cannot catch plain lowercase embellishment, see Phase 7 limitations).
- [ ] Confirm a saved loop version shows up in `GET /api/resume/versions` with the right `version_no`.
- [ ] Check error paths: empty `resume_text` (400), no token (401), a provider quota error mid-loop (should end with a `stop_reason`, not a 500).

---

## Known limitations

- **No automated tests for the loop.** `tests/` only has `test_phase3_routing.py`. A stub-agent test (like Phase 3's) would let you check each stopping rule without spending quota.
- **Cost per request.** Each round makes one Rewrite (up to 3 Gemini calls through `BaseAgent`, plus one more run if the guard retries), one Matching and one Skill Gap call. With `max_rounds = 3` that is a lot for the free tier (20 requests per day per model per key on Gemini).
- **The request is synchronous and slow.** A full loop can take a long time. The frontend must not time out early, and the route holds the connection open the whole time.
- **Round 0 is taken from the request body.** The starting score and gaps are trusted as sent by the client; the backend does not re-verify them.
- **JD detail is flattened.** `jd_from_matching()` puts every matched and missing skill into `required_skills`, so the required / preferred / implicit split from JD Analysis is lost inside the loop.
- **Matching model differs from the roadmap.** The roadmap says Gemini for Matching; the code uses Groq `openai/gpt-oss-20b`. Keep the code's value, but update the roadmap or note it so the team is not confused.
- **`version_no` uses `count_documents() + 1`.** Two simultaneous saves, or a future version deletion, can give duplicate or skipped numbers (same as Phase 7).
- **No `jd_title` or `best_iteration` stored.** Phase 9's history API needs `best_iteration` derived (the accepted round with the highest score) and has no job label for loops yet.
- **`warnings` on the saved version is empty.** Guard findings for discarded rounds live only in `loop_iterations[].warnings`.
- **The loop result itself is not stored when the original was best.** Nothing is written to the database in that case, so it will not appear in loop history.
- **Gain threshold is a judgement call.** `MIN_SCORE_GAIN = 3` stops the loop on small positive gains; raise or lower it after seeing real scores.

---

## Hand-off to frontend (Phase 8 frontend)

- Route: `POST /api/resume/improvement-loop`; the frontend's `loopApi.js` already matches the request and response above, including `max_rounds`.
- `iterations[0]` is the original resume, so rewrite rounds = `iterations.length - 1` (already fixed on the dashboard).
- Show `accepted: false` rounds as discarded, with their `warnings`.
- Before/after text comes from `original_resume` and `final_resume` in the response.
- The saved version can be opened through `GET /api/resume/versions/{final_version_id}`.

## Hand-off to Phase 9 (History backend)

- Loops can be listed from `resume_versions` where `source == "improvement_loop"`, using `loop_iterations` and `diff_summary`.
- `best_iteration` = the accepted iteration with the highest score; the stop reason is the second line of `diff_summary`.
- Details and the exact response shape are in `phase9_frontend.md`.