// Phase 8: calls the backend loop controller (requires login).
// Uses apiClient so the token and 401 handling match the rest of the app.
//
// !! Confirm LOOP_PATH and the request body with the backend owner / http://127.0.0.1:8000/docs
// Assumed response (your LoopState): { iterations: [{ iteration, score, remaining_gaps }], finished, stop_reason }
// plus, if the backend sends them: original_resume, final_resume
import { apiRequest } from "./apiClient";
import { mockLoopResponse } from "./loopMock";
const USE_MOCK = true; // set to false when the real route exists
const LOOP_PATH = "/api/resume/improvement-loop";

export function runImprovementLoop(resumeText, matchingOutput, gaps) {
  if (USE_MOCK) return mockLoopResponse("dropping"); // or "dropping" to test the score-drop warning

  return apiRequest(LOOP_PATH, {
    method: "POST",
    body: JSON.stringify({
      resume_text: resumeText,
      matching_output: matchingOutput,
      gaps: gaps,
    }),
  });
}