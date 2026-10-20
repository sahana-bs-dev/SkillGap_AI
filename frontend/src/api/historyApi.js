// History endpoints (all need login):
//   GET /api/history/analyses -> [{ id, created_at, flow, jd_title, jd_fingerprint,
//                                   ats_score, match_score, matched_skills[], missing_skills[] }]
// Resume versions already exist: /api/resume/versions (see rewriteApi.js).
//
// Any failure (404, 401, 500, server offline) is shown as a real error.
// Full contract: docs/phase9_frontend.md

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function getToken() {
  return localStorage.getItem("token") || localStorage.getItem("access_token") || "";
}

async function fetchList(path, label) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  } catch {
    throw new Error("Could not reach the server. Is the backend running?");
  }

  if (res.status === 401) throw new Error("Session expired. Please log in again.");

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `${label} (${res.status})`);

  const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
  return { items: items, isSample: false };
}

export function listAnalyses() {
  return fetchList("/api/history/analyses", "Could not load your analysis history");
}