import { Link } from "react-router-dom";

// Dashboard panel: how far along the latest learning plan is.
// A skill counts as "learned" when all of its steps are ticked.

// Big panel for the Dashboard.
export default function LearningProgress({ plan }) {
  if (!plan) return null;
  const progress = plan.progress || { done: 0, total: 0, pct: 0, learned_skills: [] };
  const learned = progress.learned_skills || [];

  return (
    <div className="panel" style={{ marginBottom: "1.2rem" }}>
      <div className="hx-panel-head">
        <h3>Your learning progress</h3>
        <Link to="/skill-gap" className="btn secondary">
          Open skill gap plan
        </Link>
      </div>
      <p className="desc">
        {plan.jd_title ? "Plan for: " + plan.jd_title + ". " : ""}
        {progress.done} of {progress.total} steps done.
      </p>

      <div
        style={{ height: 8, borderRadius: 999, background: "#e4e4e7", overflow: "hidden", margin: ".6rem 0 1rem" }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.pct}
        aria-label="Learning plan progress"
      >
        <div style={{ width: progress.pct + "%", height: "100%", background: "var(--ink)", transition: "width .25s ease" }} />
      </div>

      {learned.length > 0 ? (
        <>
          <p className="desc">
            Skills you have learned ({learned.length}). You can add them to your resume from the skill gap plan.
          </p>
          <div className="hx-chips">
            {learned.map((l) => (
              <span className="tag match" key={l.skill}>
                {l.skill}
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="desc">
          No skill finished yet. Tick all steps of a skill (Learn, Practice and Build) and it will appear here.
        </p>
      )}
    </div>
  );
}