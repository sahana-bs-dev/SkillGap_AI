import { useEffect, useState } from "react";
import { listPlans } from "../api/skillPlanApi";

// Shared by the Dashboard and History pages: loads the user's saved skill plans.
// Each plan is a summary from GET /api/skill-plans:
//   { id, analysis_id, jd_title, gap_count, progress: { done, total, pct, learned_skills[{ skill, project }] } }

// Loads the plans once. If they cannot be loaded the pages still work, they just show no learning info.
export function useSkillPlans() {
  const [state, setState] = useState({ status: "loading", plans: [] });

  useEffect(() => {
    let cancelled = false;
    listPlans()
      .then((plans) => {
        if (!cancelled) setState({ status: "done", plans: plans });
      })
      .catch((err) => {
        console.error("Could not load skill plans:", err);
        if (!cancelled) setState({ status: "error", plans: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// The saved plan that belongs to one analysis, or null.
export function planForAnalysis(plans, analysisId) {
  if (!analysisId) return null;
  return plans.find((p) => p.analysis_id === analysisId) || null;
}

export function learnedCount(plan) {
  return plan?.progress?.learned_skills?.length || 0;
}