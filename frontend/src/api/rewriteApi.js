// Talks to the FastAPI backend (all routes require login):
//   POST /api/resume/rewrite        -> { rewritten_text, diff_summary, warnings, version_id, version_no, created_at }
//   GET  /api/resume/versions       -> [{ id, version_no, parent_version_id, created_at, warning_count, preview }]
//   GET  /api/resume/versions/{id}  -> { id, version_no, created_at, original_text, rewritten_text, diff_summary, warnings }

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const API_PATH = "/api/resume/rewrite";
const VERSIONS_PATH = "/api/resume/versions";

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

async function getJson(path, failMessage) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `${failMessage} (${res.status})`);
  }

  return res.json();
}

// Newest first. Each item is a short summary (no full text).
export function listResumeVersions() {
  return getJson(VERSIONS_PATH, "Could not load version history");
}

// One full version, including the original and rewritten text.
export function getResumeVersion(versionId) {
  return getJson(`${VERSIONS_PATH}/${encodeURIComponent(versionId)}`, "Could not load that version");
}