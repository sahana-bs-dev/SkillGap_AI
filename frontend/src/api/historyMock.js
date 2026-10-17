// SAMPLE DATA ONLY. Shown (with a visible banner) while the backend has no
// /api/history/* endpoints. Once the backend exists this file is never used:
// delete it, and delete the import + the two "sample" lines in historyApi.js.

function iso(daysAgo, hour = 10) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

const ACME = { jd_title: "Backend Developer — Acme Corp", jd_fingerprint: "sample-jd-acme" };
const ZENITH = { jd_title: "Frontend Intern — Zenith Labs", jd_fingerprint: "sample-jd-zenith" };

export const SAMPLE_ANALYSES = [
  { id: "sample-a6", created_at: iso(1), flow: "resume_jd", ...ACME, ats_score: 78, match_score: 71,
    matched_skills: ["Python", "SQL", "Git", "REST APIs", "FastAPI", "MongoDB"], missing_skills: ["Docker", "Testing"] },
  { id: "sample-a5", created_at: iso(3), flow: "resume_jd", ...ZENITH, ats_score: 74, match_score: 61,
    matched_skills: ["React", "JavaScript", "HTML", "CSS", "Git", "TypeScript"], missing_skills: ["Testing", "Figma", "Accessibility"] },
  { id: "sample-a4", created_at: iso(5), flow: "resume_only", jd_title: null, jd_fingerprint: null, ats_score: 70, match_score: null,
    matched_skills: [], missing_skills: [] },
  { id: "sample-a3", created_at: iso(7), flow: "resume_jd", ...ACME, ats_score: 74, match_score: 64,
    matched_skills: ["Python", "SQL", "Git", "REST APIs", "FastAPI"], missing_skills: ["Docker", "MongoDB", "Testing"] },
  { id: "sample-a2", created_at: iso(10), flow: "resume_jd", ...ZENITH, ats_score: 66, match_score: 52,
    matched_skills: ["React", "JavaScript", "HTML", "CSS", "Git"], missing_skills: ["TypeScript", "Testing", "Figma", "Accessibility"] },
  { id: "sample-a1", created_at: iso(14), flow: "resume_jd", ...ACME, ats_score: 66, match_score: 55,
    matched_skills: ["Python", "SQL", "Git", "REST APIs"], missing_skills: ["FastAPI", "Docker", "MongoDB", "Testing"] },
  { id: "sample-a0", created_at: iso(21), flow: "resume_jd", ...ACME, ats_score: 58, match_score: 46,
    matched_skills: ["Python", "SQL", "Git"], missing_skills: ["FastAPI", "Docker", "MongoDB", "Testing", "REST APIs"] },
];

export const SAMPLE_LOOPS = [
  {
    id: "sample-l2", created_at: iso(2, 16), ...ZENITH, version_id: null, version_no: 6, best_iteration: 1,
    stop_reason: "Score dropped in round 2 (58 to 55). That round was discarded and the best earlier version kept.",
    iterations: [
      { iteration: 0, score: 52, accepted: true, remaining_gaps: ["TypeScript", "Testing", "Figma", "Accessibility"] },
      { iteration: 1, score: 58, accepted: true, remaining_gaps: ["Testing", "Figma", "Accessibility"] },
      { iteration: 2, score: 55, accepted: false, remaining_gaps: ["Testing", "Figma", "Accessibility"] },
    ],
  },
  {
    id: "sample-l1", created_at: iso(6, 11), ...ACME, version_id: null, version_no: 5, best_iteration: 2,
    stop_reason: "Score improved by less than 3 points in round 2; the loop converged.",
    iterations: [
      { iteration: 0, score: 55, accepted: true, remaining_gaps: ["FastAPI", "Docker", "MongoDB", "Testing"] },
      { iteration: 1, score: 63, accepted: true, remaining_gaps: ["Docker", "MongoDB", "Testing"] },
      { iteration: 2, score: 65, accepted: true, remaining_gaps: ["Docker", "MongoDB", "Testing"] },
    ],
  },
];