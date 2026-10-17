// History endpoints (all need login):
//   GET /api/history/analyses -> [{ id, created_at, flow, jd_title, jd_fingerprint,
//                                   ats_score, match_score, matched_skills[], missing_skills[] }]
//   GET /api/history/loops    -> [{ id, created_at, jd_title, version_id, version_no, best_iteration,
//                                   stop_reason, iterations[{ iteration, score, accepted, remaining_gaps[] }] }]
// Resume versions already exist: /api/resume/versions (see rewriteApi.js).
//
// While the backend has no /api/history/* routes (HTTP 404) the pages show clearly
// labelled SAMPLE data. Any other failure (401, 500, server offline) is a real error.
// Full contract: docs/phase9_frontend.md

import { SAMPLE_ANALYSES, SAMPLE_LOOPS } from "./historyMock";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

function getToken() {
  return localStorage.getItem("token") || localStorage.getItem("access_token") || "";
}

async function fetchList(path, label, sample) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${getToken()}` } });
  } catch {
    throw new Error("Could not reach the server. Is the backend running?");
  }

  if (res.status === 404 || res.status === 405) {
    return { items: sample, isSample: true }; // endpoint not built yet
  }
  if (res.status === 401) throw new Error("Session expired. Please log in again.");

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `${label} (${res.status})`);

  const items = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
  return { items: items, isSample: false };
}

export function listAnalyses() {
  return fetchList("/api/history/analyses", "Could not load your analysis history", SAMPLE_ANALYSES);
}

export function listLoops() {
  return fetchList("/api/history/loops", "Could not load your improvement loops", SAMPLE_LOOPS);
}