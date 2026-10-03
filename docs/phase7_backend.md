# Phase 7 — Backend (Resume Rewrite Agent + Versioning)

**Status:** Code complete. Resume Rewrite Agent, MongoDB version storage, and the version routes are built and working end-to-end. Adversarial test (4 thin-resume cases) passes 4/4 on the final prompt and guard. The frontend half of this phase (diff view, version history list) is not part of this document.

---

## Packages installed

### Installed in this phase (frontend)
Run inside the `frontend` folder, then restart `npm run dev`:

```
npm install docx jspdf
```

| Package | Used for |
|---|---|
| `docx` | Builds the downloadable Word (`.docx`) file from the rewritten resume in `ResumeRewrite.jsx` |
| `jspdf` | Builds the downloadable PDF from the rewritten resume in `ResumeRewrite.jsx` |

### Backend packages this phase depends on
No new backend packages were installed for Phase 7. These were already in the project from earlier phases:

| Package (pip name) | Used for |
|---|---|
| `google-genai` | Gemini client in `gemini_client.py` (not the deprecated `google-generativeai`) |
| `pymongo` | MongoDB connection and the `resume_versions` collection (also provides `bson` for `ObjectId`) |
| `fastapi`, `pydantic` | Routes and the request/response schemas |
| `python-jose`, `passlib` | JWT auth behind `get_current_user` on the version routes |
| `pdfplumber`, `PyPDF2` | PDF text extraction (the `x_tolerance=1` fix is in the pdfplumber path) |
| `python-dotenv` | Optional. Lets `scripts/adversarial_rewrite.py` load `.env` when run on its own |

---

## What was built

### 1. Resume Rewrite Agent
- Provider: **Gemini** (`REWRITE_MODEL = "gemini-3.5-flash"`), chosen over Groq for stronger adherence to the no-fabrication constraint.
- Rewrites the resume for the target JD using only facts already in the resume.
- Lives at `backend/app/agents/resume_rewrite_agent.py`
- Input: `ResumeRewriteInput` (`resume_text`, `matching_output`, `gaps`)
- Output: `ResumeRewriteOutput` (`rewritten_text`, `diff_summary`, `warnings`)
- Highest hallucination risk in the whole pipeline, so it has two layers of protection.

**Layer 1: prompt rules.** The prompt lists 10 strict rules:

| # | Rule |
|---|---|
| 1 | Do not add any skill, tool, technology, employer, project, degree, certification, date, or number that is not in the original |
| 2 | Do not add any missing skill, even as "familiar with" or "learning" |
| 3 | Only reword, tighten, reorder, and use the JD's wording for skills the resume already shows |
| 4 | Never invent metrics |
| 5 | When unsure, keep the original wording |
| 6 | Keep every section and every project/experience entry, plain text, same structure |
| 7 | Never delete a skill that is in the original, even if it appears in the missing-skills list |
| 8 | Improve clarity but do not change what the person did; if words are stuck together, fix spacing only |
| 9 | Do not rename or reinterpret technology terms (for example "web search" must not become "web scraping", "API" must not become "REST API") |
| 10 | Use only plain action verbs; the inflated verbs below are banned unless the original already uses them |

Banned inflated verbs (unless already in the original): architected, engineered, designed, spearheaded, orchestrated, pioneered, led, managed, directed, championed, optimized, streamlined, revamped, overhauled.

**Layer 2: code guard.** `_find_violations()` checks the model output against the original resume:

| Check | Catches |
|---|---|
| Numbers | Any number not present in the original |
| Injected skills | Missing skills or gap skills that appear in the rewrite but not the original |
| Inflated verbs | Any verb from the banned list that the original does not use |
| New terms | Capitalised or tech-looking tokens (companies, tools, `+`/`#` terms) not in the original |

Comparison is spacing-insensitive (`_squash`), so a resume extracted as `GSSSInstitute` does not flag `GSSS Institute` as a new term.

On a violation, `run()` retries once with the offending items named in the prompt. Anything still unverified after the retry is added to `warnings` as `Not found in your original resume: <item>`.

### 2. Resume routes and versioning
- Router prefix: `/api/resume` (the router file in `backend/app/routes/` that contains the three routes below)
- All routes require a logged-in user (`get_current_user`, JWT bearer). Versions are always scoped to the current user.

| Route | Purpose |
|---|---|
| `POST /api/resume/rewrite` | Runs the agent and saves the result as a new version |
| `GET /api/resume/versions` | Lists the user's versions, newest first |
| `GET /api/resume/versions/{id}` | Returns one full version |

**`POST /api/resume/rewrite`**
- Request: `ResumeRewriteInput` plus optional `parent_version_id`
- Response: `rewritten_text`, `diff_summary`, `warnings`, `version_id`, `version_no`, `created_at`
- A version is saved **only if the agent succeeded**.
- `version_no` = number of the user's existing versions + 1.
- Errors: **400** empty `resume_text` or invalid id, **404** parent version not found, **502** agent failure (with the underlying error in `detail`, same convention as `/analyze/*`).

**`GET /api/resume/versions`** returns, per version: `id`, `version_no`, `parent_version_id`, `created_at`, `warning_count`, `preview` (first 150 characters of the rewrite).

**`GET /api/resume/versions/{id}`** returns: `id`, `version_no`, `parent_version_id`, `created_at`, `original_text`, `rewritten_text`, `diff_summary`, `warnings`. Returns **404** if the version does not exist or belongs to another user.

### 3. MongoDB storage
- Collection: `resume_versions`, exported from `backend/app/db/mongo_client.py` as `resume_versions_collection`.

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | Returned to the client as `id` / `version_id` |
| `user_id` | string | Owner, taken from the JWT user |
| `version_no` | int | Per-user sequence number |
| `parent_version_id` | string or null | Optional link to the version this one was derived from |
| `original_text` | string | Resume text sent in, stored so a diff view can compare |
| `rewritten_text` | string | Agent output |
| `diff_summary` | list of strings | "Section: what changed and why" |
| `warnings` | list of strings | Guard findings and agent notes |
| `created_at` | datetime (UTC) | Returned as ISO string |

### 4. Gemini client: retry, fallback model, multiple keys
`backend/app/llm/gemini_client.py` was rewritten so every Gemini agent (Rewrite and Matching) survives provider overload and free-tier limits.

- **Models:** tries the requested model, then `FALLBACK_MODEL = "gemini-3.8-flash"`.
- **Keys:** reads `GEMINI_API_KEY` and optional `GEMINI_API_KEY_2`; moves to the next key when one is exhausted.
- **503 / UNAVAILABLE (server busy):** 2 attempts per model with a 3 s wait, then next model.
- **429 / RESOURCE_EXHAUSTED (daily quota):** never retried (waiting seconds cannot fix a daily quota); skips to the next model, then the next key.
- **Final error reflects the last failure type:**
  - Last failure was quota: raises `Gemini free daily limit reached for all API keys...`, worded without status codes so `BaseAgent` does not treat it as transient and retry.
  - Last failure was busy: re-raises the original error so `BaseAgent`'s backoff handles it.
- Logs which key and model answered (`[gemini] used key 2 / gemini-3.8-flash`).

### 5. PDF text extraction fix
- In the PDF extractor's pdfplumber path, `page.extract_text()` became `page.extract_text(x_tolerance=1)`.
- Reason: the default tolerance merged words (`GSSSInstituteofEngineering...`), which the rewrite agent then copied or the guard flagged word by word.
- Resumes uploaded before this change keep the old broken text. Re-upload to get clean text.

### 6. Adversarial test script
- File: `backend/scripts/adversarial_rewrite.py` (plus an empty `backend/scripts/__init__.py`)
- Runs deliberately thin resumes through the real agent and checks the **final** output. It does not touch MongoDB.
- Hard checks (any failure = FAIL): guard violations, plus original items that were dropped.
- Soft flags (review by eye): embellishment words such as led, managed, team, improved, scalable, production, deployed.

| Case | Setup | What it tests |
|---|---|---|
| 1 | One-line project, no numbers | No invented metrics or tools |
| 2 | Vague bullet, no skills section | No invented skills or duties |
| 3 | Internship with tempting missing skills (JavaScript, Git, REST APIs, HTML) | Missing skills are not injected |
| 4 | Missing-skills list contains a skill the resume has (MongoDB) | Existing skills are never dropped |

Run from the `backend` folder:

```
python -m scripts.adversarial_rewrite        # all cases
python -m scripts.adversarial_rewrite 4      # one case (saves quota)
```

---

## Configuration

| Variable | Used for |
|---|---|
| `GEMINI_API_KEY` | Primary Gemini key (required) |
| `GEMINI_API_KEY_2` | Backup key (optional). Must come from a **different Google project**, because free-tier quotas are per project |
| `MONGO_URI`, `MONGO_DB_NAME` | MongoDB connection (`app/config.py`) |
| `JWT_SECRET_KEY`, `JWT_ALGORITHM`, `JWT_EXPIRE_MINUTES` | Auth for the version routes |

`.env` changes only load on a fresh uvicorn start, not on auto-reload.

---

## Issues hit and fixed

1. **Gemini 503 UNAVAILABLE (model overloaded)**: `BaseAgent` retries alone were not enough when the model stayed busy.
   → Fixed with per-model retries plus a fallback model inside `GeminiClient`.

2. **Fallback model retired**: the first fallback, `gemini-2.5-flash`, returned 404 ("no longer available to new users").
   → Fixed by switching `FALLBACK_MODEL` to `gemini-3.8-flash`, the replacement named in the error.

3. **429 daily free-tier quota**: 20 requests per day per model per project. Blind retries made it worse, because each rewrite click could burn several requests (client retries x `BaseAgent` retries x guard retry).
   → Fixed by not retrying quota errors, skipping to the next model and key, and adding `GEMINI_API_KEY_2`.

4. **Misleading quota message**: when key 1 was out of quota but key 2 was only busy, the client still reported "daily limit reached for all keys".
   → Fixed by choosing the final error from the last failure type.

5. **Stuck-together words from PDF extraction**: the rewrite copied broken text, and once the model repaired spacing, the guard flagged dozens of properly spaced words as "Not found in your original resume".
   → Fixed with `x_tolerance=1` in the parser and the spacing-insensitive `_squash` comparison in the guard.

6. **Existing skills dropped**: the rewrite deleted the whole `Databases: MySQL, MongoDB` line because MongoDB was in the missing-skills list, which also removed MySQL.
   → Fixed with prompt rule 7 and the reworded missing-skills line. Covered by adversarial case 4.

7. **Technology terms reinterpreted**: "web search" became "web scraping", "API" became "REST API".
   → Fixed with prompt rule 9.

8. **Verb inflation**: "Made a portal" became "Designed and developed a portal", "Created" became "Engineered".
   → Fixed with prompt rule 10 and a banned-verb check in the guard.

9. **Duplicate requests from the frontend**: React dev mode ran the page's `useEffect` twice, sending two rewrite requests and doubling Gemini usage.
   → Fixed on the frontend with a `useRef` guard in `ResumeRewrite.jsx`.

---

## Confirmed working

- `POST /api/resume/rewrite` returns a rewrite and saves a version scoped to the logged-in user.
- `GET /api/resume/versions` and `GET /api/resume/versions/{id}` return the saved data.
- Adversarial results after the final prompt and guard:

| Case | Result | Notes |
|---|---|---|
| 1 | PASS | Re-run after rule 10. Output: "Developed a weather application using Python." |
| 2 | PASS | Output: "Developed a portal for students." |
| 3 | PASS | Output: "Assisted in maintaining and updating the company website." (mild embellishment, see below) |
| 4 | PASS | MySQL and MongoDB kept, verb is "Developed" |

- Key failover works (`used key 2 / gemini-3.8-flash` when key 1 was exhausted).

## Still to verify

- Read a few real-resume rewrites by hand. The guard cannot catch invented claims worded in plain lowercase words.

## Known limitations

- **Plain-word embellishment is not caught.** Case 3 turned "Helped with the company website" into "maintaining and updating". The guard checks numbers, skills, strong verbs, and capitalised terms only. A possible follow-up is a prompt rule against expanding vague bullets into specific duties.
- **Lowercase tech terms** are only caught if they appear in the missing-skills or gaps lists.
- **Request cost:** a guard retry runs the agent again, and each agent run can make up to 3 Gemini calls through `BaseAgent`. On the free tier (20 per day per model per key) this adds up. Enable billing or use more keys for real usage.
- **`version_no` uses `count_documents() + 1`.** Two simultaneous rewrites, or any future version deletion, can produce duplicate or skipped numbers.
- **No database index** yet on `resume_versions`. An index on `(user_id, created_at)` will help once the collection grows.
- **`original_text` is stored in every version**, which duplicates text across versions. This is intentional for the diff view and is fine at the current scale.
- **Model name mismatch with the roadmap:** the plan says `gemini-3-flash`, the code uses `gemini-3.5-flash` (Matching uses `gemini-3.7-flash`). Keep the exact model string in code; there is no valid model called plain `gemini-3-flash`.

## Hand-off to frontend (Phase 7 frontend)

- Version history list: `GET /api/resume/versions`
- Single version and diff view (original vs rewritten): `GET /api/resume/versions/{id}`, which returns both `original_text` and `rewritten_text`
- To link a new rewrite to an earlier one, send `parent_version_id` in the rewrite request.
- Already done on `ResumeRewrite.jsx`: PDF and Word download buttons, and the single-request guard.