// Talks to the FastAPI backend's /analyze/* endpoints.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

// Resume only -> ATS Agent. Response: { score, issues, suggestions }
export async function runATSAnalysis(resumeText) {
  const res = await fetch(`${API_BASE}/analyze/ats`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume_text: resumeText }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ATS analysis failed (${res.status}): ${detail}`);
  }

  return res.json();
}

// Resume + JD -> JD Analysis Agent -> Matching Agent.
// Response: { score, matched_skills: [{skill, evidence}], missing_skills, relevant_experience }
export async function runMatchAnalysis(resumeText, jdText) {
  const res = await fetch(`${API_BASE}/analyze/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume_text: resumeText, jd_text: jdText }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Match analysis failed (${res.status}): ${detail}`);
  }

  return res.json();
}


export async function runSkillGapAnalysis(matchingOutput) {
  const res = await fetch(`${API_BASE}/analyze/skill-gap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ matching_output: matchingOutput }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Skill gap analysis failed (${res.status})`);
  }
  return res.json();
}

export async function runLearningPlan(gaps) {
  const res = await fetch(`${API_BASE}/analyze/learning`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ gaps }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Learning plan generation failed (${res.status})`);
  }
  return res.json();
}