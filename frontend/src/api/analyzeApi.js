// Talks to the FastAPI backend's /analyze/ats endpoint (Supervisor routes
// here when only a resume is uploaded, no JD). Body matches the backend's
// ATSInput schema exactly: { resume_text }. Response matches ATSOutput:
// { score, issues: [{category,severity,message}], suggestions }

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

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