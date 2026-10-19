import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import AnalysisLoader from "../../components/AnalysisLoader";
import EmptyState from "../../components/EmptyState/EmptyState";
import { runSkillGapAnalysis, runLearningPlan } from "../../api/analyzeApi";
import "../MatchReport/MatchReport.css";// reusing the same panel/row-list/tag styles
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";

// Route: requires the Matching Agent's output from the Match Report page.
//   navigate("/skill-gap", { state: { matchingOutput } })
// or via <Link to="/skill-gap" state={{ matchingOutput: report }} />

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const LOADER_MESSAGES = [
  "Finding the skills worth working on",
  "Ranking gaps by importance",
  "Choosing projects and resources",
  "Putting your learning plan together",
];

export default function SkillGapPlan() {
  const { state } = useLocation();
  const matchingOutput = state?.matchingOutput;
  const resumeText = state?.resumeText;

  // 'empty' = no match report yet, 'loading' | 'done' | 'error' as before
  const [status, setStatus] = useState("loading");
  const [gaps, setGaps] = useState([]);
  const [plan, setPlan] = useState([]);
  const [checked, setChecked] = useState({}); // { "skill::step": true }
  const [attempt, setAttempt] = useState(0); // goes up by one on "Try again"

  useEffect(() => {
    if (!matchingOutput) {
      setStatus("empty");
      return;
    }

    let cancelled = false;

    async function runPipeline() {
      setStatus("loading");

      try {
        const gapResult = await runSkillGapAnalysis(matchingOutput);
        if (cancelled) return;
        setGaps(gapResult.gaps || []);

        const learningResult = await runLearningPlan(gapResult.gaps || []);
        if (cancelled) return;
        setPlan(learningResult.plan || []);
        setStatus("done");
      } catch (err) {
        if (cancelled) return;
        // The real error stays in the console for you; the user sees a friendly message.
        console.error("Skill gap plan failed:", err);
        setStatus("error");
      }
    }

    runPipeline();
    return () => {
      cancelled = true;
    };
  }, [matchingOutput, attempt]);

  const sortedGaps = [...gaps].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
  );

  function planFor(skill) {
    return plan.find((p) => p.skill === skill);
  }

  function toggleStep(skill, step) {
    const key = `${skill}::${step}`;
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function stepProgress(skill) {
    const p = planFor(skill);
    if (!p) return { done: 0, total: 0 };
    const steps = stepsFor(p);
    const done = steps.filter((s) => checked[`${skill}::${s.key}`]).length;
    return { done, total: steps.length };
  }

  function stepsFor(p) {
    const steps = [];
    if (p.learn_resources?.length) steps.push({ key: "learn", label: "Learn", items: p.learn_resources });
    if (p.practice_resources?.length) steps.push({ key: "practice", label: "Practice", items: p.practice_resources });
    if (p.build_project) steps.push({ key: "build", label: "Build", items: [p.build_project] });
    return steps;
  }

  /* ---------- list builders (plain loops) ---------- */

  function renderGapSummaryRows() {
    const rows = [];
    for (let i = 0; i < sortedGaps.length; i++) {
      const gap = sortedGaps[i];
      const progress = stepProgress(gap.skill);
      rows.push(
        <div className="row-item" key={"summary-" + i}>
          <div>
            <div className="label">{gap.skill}</div>
            {progress.total > 0 && (
              <p className="desc">
                {progress.done}/{progress.total} steps checked off
              </p>
            )}
          </div>
          <span className={`tag ${priorityTag(gap.priority)}`}>{gap.priority}</span>
        </div>
      );
    }
    return rows;
  }

  function renderProjects(projects) {
    const rows = [];
    for (let j = 0; j < projects.length; j++) {
      rows.push(
        <div className="row-item" key={"project-" + j}>
          <p className="desc">{projects[j]}</p>
        </div>
      );
    }
    return rows;
  }

  function renderStepItems(items) {
    const lines = [];
    for (let k = 0; k < items.length; k++) {
      const item = items[k];
      if (typeof item === "string") {
        lines.push(
          <p className="desc" key={"item-" + k}>
            {item}
          </p>
        );
      } else {
        lines.push(
          <p className="desc" key={"item-" + k}>
            <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
              {item.title}
            </a>
          </p>
        );
      }
    }
    return lines;
  }

  function renderSteps(gap, steps) {
    const rows = [];
    for (let s = 0; s < steps.length; s++) {
      const step = steps[s];
      rows.push(
        <div key={step.key}>
          <div
            className="row-item"
            style={{ cursor: "pointer" }}
            onClick={() => toggleStep(gap.skill, step.key)}
          >
            <div>
              <div className="label">
                {checked[`${gap.skill}::${step.key}`] ? "☑" : "☐"} {step.label}
              </div>
              {renderStepItems(step.items)}
            </div>
          </div>
        </div>
      );
    }
    return rows;
  }

  function renderGapCards() {
    const cards = [];
    for (let i = 0; i < sortedGaps.length; i++) {
      const gap = sortedGaps[i];
      const p = planFor(gap.skill);
      const steps = p ? stepsFor(p) : [];

      cards.push(
        <div className="panel" key={"card-" + i}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h3>{gap.skill}</h3>
            <span className={`tag ${priorityTag(gap.priority)}`}>{gap.priority}</span>
          </div>

          {gap.suggested_projects?.length > 0 && (
            <>
              <p className="label" style={{ marginTop: "0.6rem" }}>
                Suggested projects
              </p>
              <div className="row-list">{renderProjects(gap.suggested_projects)}</div>
            </>
          )}

          {steps.length > 0 ? (
            <>
              <p className="label" style={{ marginTop: "0.9rem" }}>
                Learn → Practice → Build
              </p>
              <div className="row-list">{renderSteps(gap, steps)}</div>
            </>
          ) : (
            <p className="desc" style={{ marginTop: "0.9rem" }}>
              No curated resources found for this skill yet.
            </p>
          )}
        </div>
      );
    }
    return cards;
  }

  return (
    <div className="shell">
      <Sidebar />
      <section className="route" style={{ padding: "2rem" }}>
        <div className="page-head">
          <div>
            <span className="kicker"></span>
            <h1>Skill gap &amp; learning plan</h1>
            <p>Prioritized gaps from your match report, with a Learn → Practice → Build plan for each</p>
          </div>
          {status !== "empty" ? (
            <Link to="/match-report" className="btn secondary">
              Back to match report
            </Link>
          ) : null}
        </div>

        {status === "loading" && (
          <AnalysisLoader title="Building your learning plan" messages={LOADER_MESSAGES} />
        )}

        {status === "empty" && (
          <EmptyState
            title="No skill gaps to show yet"
            message="Match your resume against a job description first. Your skill gaps and learning plan will appear here."
            actionLabel="Start a new analysis"
            actionTo="/upload"
          />
        )}

        {status === "error" && (
          <EmptyState
            title="We couldn't build your plan"
            message="Something went wrong while building your learning plan. Please try again."
            actionLabel="Try again"
            onAction={() => setAttempt(attempt + 1)}
          />
        )}

        {status === "done" && sortedGaps.length === 0 && (
          <div className="panel">
            <p>No skill gaps to close — great coverage on this match.</p>
          </div>
        )}

        {status === "done" && sortedGaps.length > 0 && (
          <>
            <div className="panel" style={{ marginTop: "1.2rem" }}>
              <h3>Prioritized gaps</h3>
              <div className="row-list">{renderGapSummaryRows()}</div>
            </div>

            <div className="grid-2" style={{ marginTop: "1.2rem" }}>
              {renderGapCards()}
            </div>

            <div className="callout" style={{ marginTop: "1.2rem" }}>
              <p>
                Ready to update your resume with these projects once built?{" "}
                <Link to="/resume-rewrite" state={{ resumeText, matchingOutput, gaps }}>Go to Resume Rewrite</Link>.
              </p>
            </div>
          </>
        )}

        <footer className="note">SkillGap AI</footer>
      </section>
    </div>
  );
}

function priorityTag(priority) {
  if (priority === "high") return "gap";
  if (priority === "low") return "match";
  return "active"; // medium
}