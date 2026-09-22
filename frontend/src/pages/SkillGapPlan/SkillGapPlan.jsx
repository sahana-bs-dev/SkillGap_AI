import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import AgentStatusIndicator from "../../components/AgentStatus/AgentStatusIndicator";
import { runSkillGapAnalysis, runLearningPlan } from "../../api/analyzeApi";
import "../MatchReport/MatchReport.css";// reusing the same panel/row-list/tag styles
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";

// Route: requires the Matching Agent's output from the Match Report page.
//   navigate("/skill-gap", { state: { matchingOutput } })
// or via <Link to="/skill-gap" state={{ matchingOutput: report }} />

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

export default function SkillGapPlan() {
  const { state } = useLocation();
  const matchingOutput = state?.matchingOutput;
  const resumeText = state?.resumeText;

  const [status, setStatus] = useState("loading"); // 'loading' | 'done' | 'error'
  const [gapStage, setGapStage] = useState("idle"); // 'idle' | 'working' | 'done' | 'error'
  const [learningStage, setLearningStage] = useState("idle");
  const [gaps, setGaps] = useState([]);
  const [plan, setPlan] = useState([]);
  const [checked, setChecked] = useState({}); // { "skill::step": true }
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!matchingOutput) {
      setStatus("error");
      setErrorMsg("No match report found — run a resume/JD match first.");
      return;
    }

    let cancelled = false;

    async function runPipeline() {
      setStatus("loading");
      setGapStage("working");

      try {
        const gapResult = await runSkillGapAnalysis(matchingOutput);
        if (cancelled) return;
        setGaps(gapResult.gaps || []);
        setGapStage("done");

        setLearningStage("working");
        const learningResult = await runLearningPlan(gapResult.gaps || []);
        if (cancelled) return;
        setPlan(learningResult.plan || []);
        setLearningStage("done");
        setStatus("done");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err.message);
        setStatus("error");
        setGapStage((s) => (s === "working" ? "error" : s));
        setLearningStage((s) => (s === "working" ? "error" : s));
      }
    }

    runPipeline();
    return () => {
      cancelled = true;
    };
  }, [matchingOutput]);

  const agents = [
    { name: "Supervisor Agent", status: "done", label: "routed" },
    {
      name: "Skill Gap Agent",
      status: gapStage === "done" ? "done" : gapStage === "error" ? "idle" : gapStage === "working" ? "working" : "idle",
      label: gapStage === "done" ? "complete" : gapStage === "error" ? "failed" : gapStage === "working" ? "running…" : "not run",
    },
    {
      name: "Learning Agent",
      status: learningStage === "done" ? "done" : learningStage === "error" ? "idle" : learningStage === "working" ? "working" : "idle",
      label: learningStage === "done" ? "complete" : learningStage === "error" ? "failed" : learningStage === "working" ? "running…" : "not run",
    },
  ];

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
          <Link to="/match-report" className="btn secondary">
            Back to match report
          </Link>
        </div>

        <AgentStatusIndicator agents={agents} />

        {status === "loading" && (
          <div className="panel">
            <p>
              {gapStage === "working" && "Running the Skill Gap Agent…"}
              {gapStage === "done" && learningStage === "working" && "Building your learning plan…"}
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="panel">
            <p style={{ color: "var(--gap)" }}>{errorMsg}</p>
          </div>
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
              <div className="row-list">
                {sortedGaps.map((gap, i) => {
                  const { done, total } = stepProgress(gap.skill);
                  return (
                    <div className="row-item" key={i}>
                      <div>
                        <div className="label">{gap.skill}</div>
                        {total > 0 && (
                          <p className="desc">
                            {done}/{total} steps checked off
                          </p>
                        )}
                      </div>
                      <span className={`tag ${priorityTag(gap.priority)}`}>{gap.priority}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid-2" style={{ marginTop: "1.2rem" }}>
              {sortedGaps.map((gap, i) => {
                const p = planFor(gap.skill);
                const steps = p ? stepsFor(p) : [];

                return (
                  <div className="panel" key={i}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <h3>{gap.skill}</h3>
                      <span className={`tag ${priorityTag(gap.priority)}`}>{gap.priority}</span>
                    </div>

                    {gap.suggested_projects?.length > 0 && (
                      <>
                        <p className="label" style={{ marginTop: "0.6rem" }}>
                          Suggested projects
                        </p>
                        <div className="row-list">
                          {gap.suggested_projects.map((proj, j) => (
                            <div className="row-item" key={j}>
                              <p className="desc">{proj}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {steps.length > 0 ? (
                      <>
                        <p className="label" style={{ marginTop: "0.9rem" }}>
                          Learn → Practice → Build
                        </p>
                        <div className="row-list">
                          {steps.map((step) => (
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
                                  {step.items.map((item, k) =>
                                    typeof item === "string" ? (
                                      <p className="desc" key={k}>{item}</p>
                                    ) : (
                                      <p className="desc" key={k}><a href={item.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{item.title}</a></p>
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="desc" style={{ marginTop: "0.9rem" }}>
                        No curated resources found for this skill yet.
                      </p>
                    )}
                  </div>
                );
              })}
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