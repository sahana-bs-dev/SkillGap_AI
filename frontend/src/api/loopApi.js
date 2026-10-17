// Phase 8: calls the backend loop controller (requires login).
// Uses apiClient so the token and 401 handling match the rest of the app.
//
// POST /api/resume/improvement-loop
// Request:  { resume_text, matching_output, gaps, max_rounds }
// Response: { iterations: [{ iteration, score, remaining_gaps, accepted, warnings }],
//             finished, stop_reason, original_resume, final_resume,
//             best_iteration, max_rounds, final_version_id, final_version_no }
import { apiRequest } from "./apiClient";

const LOOP_PATH = "/api/resume/improvement-loop";

export function runImprovementLoop(resumeText, matchingOutput, gaps, maxRounds = 3) {
  return apiRequest(LOOP_PATH, {
    method: "POST",
    body: JSON.stringify({
      resume_text: resumeText,
      matching_output: matchingOutput,
      gaps: gaps,
      max_rounds: maxRounds,
    }),
  });
}