// Saved skill plans (all routes need login):
//   POST  /api/skill-plans                    -> save a plan for one analysis
//   GET   /api/skill-plans                    -> short list of all your plans (newest first), with progress
//   GET   /api/skill-plans/latest             -> the newest plan
//   GET   /api/skill-plans/by-analysis/{id}   -> the plan that belongs to one analysis
//   GET   /api/skill-plans/{id}               -> one plan by its id
//   PATCH /api/skill-plans/{id}/progress      -> save ticks (and notes)
//
// A saved plan looks like:
//   { id, analysis_id, jd_title, created_at, updated_at, resume_text, matching_output,
//     gaps[], plan[], checked{ "skill::step": true }, notes{ skill: text },
//     progress{ done, total, pct, covered_skills[], learned_skills[{ skill, project }] } }
//   learned_skills = skills whose steps are ALL ticked; Resume Rewrite adds those to the resume.
//
// The two "get" helpers return null when nothing is saved yet (404), and throw for real errors.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const BASE_PATH = "/api/skill-plans";

function getToken() {
  return localStorage.getItem("token") || localStorage.getItem("access_token") || "";
}

function headers(json) {
  const h = { Authorization: `Bearer ${getToken()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function request(path, options, failMessage) {
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error("Could not reach the server. Is the backend running?");
  }
  if (res.status === 401) throw new Error("Session expired. Please log in again.");
  return { res, failMessage };
}

async function readJson({ res, failMessage }, allowNotFound) {
  if (allowNotFound && res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || `${failMessage} (${res.status})`);
  return data;
}

// Summaries, newest first: { id, analysis_id, jd_title, gap_count, progress{...} }. Never null.
export async function listPlans() {
  const r = await request(BASE_PATH, { headers: headers(false) }, "Could not load your skill plans");
  const data = await readJson(r, false);
  return Array.isArray(data) ? data : [];
}

export async function getLatestPlan() {
  const r = await request(`${BASE_PATH}/latest`, { headers: headers(false) }, "Could not load your skill plan");
  return readJson(r, true);
}

export async function getPlan(planId) {
  const r = await request(
    `${BASE_PATH}/${encodeURIComponent(planId)}`,
    { headers: headers(false) },
    "Could not load your skill plan"
  );
  return readJson(r, true);
}

export async function getPlanByAnalysis(analysisId) {
  const r = await request(
    `${BASE_PATH}/by-analysis/${encodeURIComponent(analysisId)}`,
    { headers: headers(false) },
    "Could not load your skill plan"
  );
  return readJson(r, true);
}

// body: { analysis_id, resume_text, matching_output, gaps, plan }
export async function createPlan(body) {
  const r = await request(
    BASE_PATH,
    { method: "POST", headers: headers(true), body: JSON.stringify(body) },
    "Could not save your skill plan"
  );
  return readJson(r, false);
}

// Send the full map of ticked steps every time: { "skill::step": true }
export async function saveProgress(planId, checked, notes) {
  const body = { checked: checked || {} };
  if (notes) body.notes = notes;
  const r = await request(
    `${BASE_PATH}/${encodeURIComponent(planId)}/progress`,
    { method: "PATCH", headers: headers(true), body: JSON.stringify(body) },
    "Could not save your progress"
  );
  return readJson(r, false);
}