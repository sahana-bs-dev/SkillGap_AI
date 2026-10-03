// Talks to the FastAPI backend: POST /api/resume/rewrite (requires login).
// Response: { rewritten_text, diff_summary, warnings, version_id, version_no, created_at }

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const API_PATH = "/api/resume/rewrite";

function getToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("access_token") ||
    ""
  );
}

export async function runResumeRewrite(resumeText, matchingOutput, gaps) {
  const res = await fetch(`${API_BASE}${API_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
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