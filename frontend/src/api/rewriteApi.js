// Talks to the FastAPI backend's /rewrite/* endpoint.
// Contract matches backend/app/llm/schemas.py: ResumeRewriteInput / ResumeRewriteOutput
//
// NOTE: This endpoint doesn't exist on the backend yet (Phase 7 backend,
// not yet built as of writing). This file is written against the schema
// your teammate already defined, so once routes/rewrite.py exists and
// matches ResumeRewriteInput/Output, this should work with zero changes.
// If the actual route path differs from /rewrite/resume, update API_PATH
// below — nothing else in this file or in ResumeRewrite.jsx needs to change.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const API_PATH = "/rewrite/resume";

// Request body: { resume_text, matching_output, gaps }
// Response body: { rewritten_text, diff_summary: [...], warnings: [...] }
export async function runResumeRewrite(resumeText, matchingOutput, gaps) {
  const res = await fetch(`${API_BASE}${API_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      resume_text: resumeText,
      matching_output: matchingOutput,
      gaps: gaps,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Resume rewrite failed (${res.status})`);
  }

  return res.json();
}