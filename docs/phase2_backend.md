# Phase 2 — Backend: Upload & Parsing

**Status:** ✅ Complete and verified end-to-end

**Scope (per roadmap):** PDF/DOCX text extraction service, `/upload` endpoint that returns parsed text.

---
## Tech / Packages Used

| Package | Purpose |
|---|---|
| `pdfplumber` | Primary PDF text extraction — better layout handling |
| `PyPDF2` | Fallback PDF text extraction if pdfplumber returns empty text |
| `python-docx` | Extracts text from DOCX files (paragraphs + table cells) |
| `python-multipart` | Required by FastAPI to parse multipart form data (`File`, `Form` fields) — missing this causes the `/upload` endpoint to fail on startup/request |

### Install

After pulling this branch, re-run the backend install so the new parsing packages are picked up:

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If `/upload` throws an error about multipart form data, `python-multipart` is missing — it's now pinned in `requirements.txt`.

---

## Folder Structure Added

```
backend/app/
  parsing/
    pdf_parser.py    — PDF text extraction (pdfplumber + PyPDF2 fallback)
    docx_parser.py   — DOCX text extraction (python-docx)
    routes.py        — POST /upload endpoint
```

---

## Files Written and What Each Does

- **`app/parsing/pdf_parser.py`** — `extract_text_from_pdf(file_bytes)`. Tries `pdfplumber` first since it handles layout better; if that comes back empty (e.g. certain PDF encodings pdfplumber struggles with), falls back to `PyPDF2`. Output is cleaned (blank lines stripped) before returning.

- **`app/parsing/docx_parser.py`** — `extract_text_from_docx(file_bytes)`. Walks both paragraphs and table cells, since resumes sometimes use tables for layout (e.g. a two-column skills section) — a paragraph-only extractor would silently drop that content.

- **`app/parsing/routes.py`** — Defines `POST /upload`. Accepts either a `resume_file` (PDF/DOCX) or `resume_text` (pasted text), plus an optional `jd_text`. Validates: at least one resume source is present, file extension is `.pdf` or `.docx`, and extracted text isn't empty (catches scanned/image-only resumes and prompts the user to paste text instead). Returns `{ resumeText, jdText }` as clean strings — no analysis happens here, that's Phase 4/5 work.

- **`backend/requirements.txt`** — Added `pdfplumber`, `PyPDF2`, `python-docx`, `python-multipart`.

---

## Endpoint Implemented

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/upload` | Accepts a resume (file or pasted text) + optional JD text, returns parsed plain text for both |

---

## Testing Done

- Uploaded a PDF resume — confirmed clean, correctly parsed text came back in the response.
- Uploaded a DOCX resume — confirmed the separate parser path (table + paragraph walk) also returns clean text.
- Tested pasting resume text directly instead of uploading a file — confirmed the `resume_text` branch works independently of the file branch.
- Tested "Resume only" vs "Resume + job description" — confirmed `jdText` comes through correctly when present and returns an empty string when not.
- Hit the missing-`python-multipart` error early on (`/upload` failed until it was installed) — fixed by installing it and adding it to `requirements.txt` so it isn't missed on a fresh setup.

---

## Known Quirks / Notes for Next Time

- `python-multipart` is a runtime requirement for any FastAPI route using `File`/`Form`, but it isn't installed automatically with `fastapi` itself — easy to miss until the first file-upload request fails.
- The endpoint only returns parsed text; it does not validate resume *content* (e.g. missing sections). That's the ATS Agent's job in Phase 4, not the parsing layer's.
- Scanned/image-only PDFs will return an empty string from both `pdfplumber` and `PyPDF2` — the endpoint catches this and returns a clear error telling the user to paste text instead, rather than silently returning nothing.

---