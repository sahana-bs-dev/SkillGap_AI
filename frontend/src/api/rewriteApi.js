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

// Job rewrite:  runResumeRewrite(resumeText, matchingOutput, gaps)
// ATS fix:      runResumeRewrite(resumeText, null, null, atsReport)
//               (atsReport is the { score, issues, suggestions } the ATS report returned)
// Learned skills: runResumeRewrite(resumeText, matchingOutput, gaps, null, { planId, skills })
//               planId = the saved skill plan; skills = the names of the learned skills to add.
//               The server reads the plan itself, so these names can only narrow the list down.
export async function runResumeRewrite(resumeText, matchingOutput, gaps, atsReport, learned) {
  const body = { resume_text: resumeText };

  if (matchingOutput) {
    body.matching_output = matchingOutput;
    body.gaps = gaps || [];
    if (learned?.planId) {
      body.plan_id = learned.planId;
      body.learned_skill_names = learned.skills || [];
    }
  } else if (atsReport) {
    body.ats_issues = atsReport.issues || [];
    body.ats_suggestions = atsReport.suggestions || [];
  }

  const res = await fetch(`${API_BASE}${API_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
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