// Temporary mock for Phase 8. Delete once the real backend route exists.
// Shape follows LoopState: iterations[{iteration, score, remaining_gaps}], finished, stop_reason

const SCENARIOS = {
  improving: {
    iterations: [
      { iteration: 0, score: 52, remaining_gaps: ["Docker", "REST API design", "Unit testing", "CI/CD", "System design"] },
      { iteration: 1, score: 61, remaining_gaps: ["Unit testing", "CI/CD", "System design"] },
      { iteration: 2, score: 68, remaining_gaps: ["CI/CD", "System design"] },
      { iteration: 3, score: 71, remaining_gaps: ["System design"] },
    ],
    finished: true,
    stop_reason: "Score improved by less than 5 points; loop converged.",
  },
  dropping: {
    iterations: [
      { iteration: 0, score: 55, remaining_gaps: ["Docker", "Testing", "CI/CD"] },
      { iteration: 1, score: 63, remaining_gaps: ["Testing", "CI/CD"] },
      { iteration: 2, score: 58, remaining_gaps: ["Testing", "CI/CD", "Docker"] },
    ],
    finished: true,
    stop_reason: "Score dropped; loop stopped to avoid making the resume worse.",
  },
};

const FINAL_TEXT =
  "SHOBITHA\nThird-year engineering student\n\nPROJECTS\n- Built a Next.js e-commerce app with Supabase auth and an account dashboard.\n- Worked in a small team on client projects, using Git for collaboration.";

export function mockLoopResponse(scenario = "improving") {
  const base = SCENARIOS[scenario] || SCENARIOS.improving;
  return new Promise(function (resolve) {
    setTimeout(function () {
      resolve({ ...base, final_resume: FINAL_TEXT });
    }, 1200); // fake delay so you can see the loading state
  });
}