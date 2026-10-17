import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import AgentStatusIndicator from "../../components/AgentStatus/AgentStatusIndicator";
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";
import "../MatchReport/MatchReport.css"; // shared panel / row-list styles
import { runImprovementLoop } from "../../api/loopApi";
import "./ImprovementLoop.css";

// Route: expects the same state the rewrite page already has.
//   navigate("/improvement-loop", { state: { resumeText, matchingOutput, gaps } })

/* ---------- helpers ---------- */

function gapLabel(gap) {
  if (typeof gap === "string") return gap;
  if (gap && typeof gap === "object") {
    return gap.skill || gap.missing_skill || gap.name || JSON.stringify(gap);
  }
  return String(gap);
}

function formatDelta(delta) {
  if (delta > 0) return "+" + delta;
  return String(delta);
}

function deltaClass(delta) {
  if (delta > 0) return "loop-up";
  if (delta < 0) return "loop-down";
  return "loop-flat";
}

// Scores are shown out of 100. If the backend sends 0 to 1, scale them.
function normalizeScores(iterations) {
  let max = 0;
  for (let i = 0; i < iterations.length; i++) {
    const value = Number(iterations[i].score) || 0;
    if (value > max) max = value;
  }
  const factor = max > 0 && max <= 1 ? 100 : 1;

  const scores = [];
  for (let i = 0; i < iterations.length; i++) {
    const value = (Number(iterations[i].score) || 0) * factor;
    scores.push(Math.round(value * 10) / 10);
  }
  return scores;
}

function getFinalText(result, iterations) {
  if (result.final_resume) return result.final_resume;
  if (result.final_text) return result.final_text;
  if (result.rewritten_text) return result.rewritten_text;
  if (iterations.length > 0 && iterations[iterations.length - 1].resume_text) {
    return iterations[iterations.length - 1].resume_text;
  }
  return "";
}

/* ---------- score over time (plain SVG) ---------- */

function ScoreChart({ scores, iterations }) {
  const width = 640;
  const height = 260;
  const padLeft = 44;
  const padRight = 28;
  const padTop = 24;
  const padBottom = 38;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  const count = scores.length;

  const gridLines = [];
  const gridValues = [0, 25, 50, 75, 100];
  for (let g = 0; g < gridValues.length; g++) {
    const y = padTop + innerHeight - (gridValues[g] / 100) * innerHeight;
    gridLines.push(
      <g key={"grid-" + g}>
        <line x1={padLeft} x2={width - padRight} y1={y} y2={y} className="loop-grid" />
        <text x={padLeft - 10} y={y + 4} className="loop-axis loop-axis-y">
          {gridValues[g]}
        </text>
      </g>
    );
  }

  const dots = [];
  const labels = [];
  let path = "";
  for (let i = 0; i < count; i++) {
    const clamped = Math.max(0, Math.min(100, scores[i]));
    const x = count === 1 ? padLeft + innerWidth / 2 : padLeft + (i / (count - 1)) * innerWidth;
    const y = padTop + innerHeight - (clamped / 100) * innerHeight;

    path += (i === 0 ? "M" : "L") + x + " " + y + " ";
    dots.push(
      <g key={"dot-" + i}>
        <circle
          cx={x}
          cy={y}
          r="5"
          className="loop-dot"
          style={iterations[i].accepted === false ? { stroke: "var(--gap)" } : undefined}
        />
        <text x={x} y={y - 12} className="loop-point-value">
          {scores[i]}
        </text>
      </g>
    );
    labels.push(
      <text key={"label-" + i} x={x} y={height - 14} className="loop-axis loop-axis-x">
        {"Round " + iterations[i].iteration + (iterations[i].accepted === false ? " \u2715" : "")}
      </text>
    );
  }

  return (
    <svg
      viewBox={"0 0 " + width + " " + height}
      className="loop-chart"
      role="img"
      aria-label="Match score after each rewrite round"
    >
      {gridLines}
      {count > 1 ? <path d={path} className="loop-line" /> : null}
      {dots}
      {labels}
    </svg>
  );
}

/* ---------- iteration breakdown ---------- */

function GapChips({ gaps }) {
  const chips = [];
  for (let i = 0; i < gaps.length; i++) {
    chips.push(
      <span key={"gap-" + i} className="loop-chip">
        {gapLabel(gaps[i])}
      </span>
    );
  }
  return <div className="loop-chips">{chips}</div>;
}

function IterationBreakdown({ iterations, scores }) {
  const rows = [];
  for (let i = 0; i < iterations.length; i++) {
    const gaps = iterations[i].remaining_gaps || [];
    const warnings = iterations[i].warnings || [];
    const warningLines = [];
    for (let k = 0; k < warnings.length; k++) {
      warningLines.push(
        <p className="desc" key={"warn-" + k}>
          {warnings[k]}
        </p>
      );
    }
    const delta = i === 0 ? null : Math.round((scores[i] - scores[i - 1]) * 10) / 10;

    rows.push(
      <details className="row-item loop-round" key={"round-" + i}>
        <summary className="loop-round-head">
          <span className="loop-round-name">
            {"Round " + iterations[i].iteration}
            {iterations[i].accepted === false ? <span className="tag gap" style={{ marginLeft: "0.5rem" }}>discarded</span> : null}
          </span>
          <span className="loop-round-score">{scores[i]}</span>
          {delta === null ? (
            <span className="loop-flat">Starting score</span>
          ) : (
            <span className={deltaClass(delta)}>{formatDelta(delta) + " from last round"}</span>
          )}
          <span className="loop-round-gaps">
            {gaps.length === 1 ? "1 gap left" : gaps.length + " gaps left"}
          </span>
        </summary>
        <div className="loop-round-body">
          {gaps.length === 0 ? (
            <p className="desc">No gaps left after this round.</p>
          ) : (
            <GapChips gaps={gaps} />
          )}
          {warnings.length > 0 ? (
            <div style={{ marginTop: "0.8rem" }}>
              <p className="desc" style={{ color: "var(--gap)", marginBottom: "0.3rem" }}>
                Content not found in your original resume:
              </p>
              {warningLines}
            </div>
          ) : null}
        </div>
      </details>
    );
  }
  return <div className="row-list">{rows}</div>;
}

/* ---------- page ---------- */

export default function ImprovementLoop() {
  const { state } = useLocation();
  const resumeText = state?.resumeText;
  const matchingOutput = state?.matchingOutput;
  const gaps = state?.gaps;

  const [status, setStatus] = useState("loading"); // 'loading' | 'done' | 'error'
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Stops React dev mode from starting the loop twice
  const hasStarted = useRef(false);

  async function startLoop() {
    setStatus("loading");
    setErrorMsg("");
    try {
      const data = await runImprovementLoop(resumeText, matchingOutput, gaps);
      setResult(data);
      setStatus("done");
    } catch (err) {
      setErrorMsg(err.message);
      setStatus("error");
    }
  }

  useEffect(() => {
    if (!resumeText || !matchingOutput || !gaps) {
      setStatus("error");
      setErrorMsg(
        "Missing resume text, match report, or skill gaps. Start the loop from the Resume rewrite page."
      );
      return;
    }
    if (hasStarted.current) return;
    hasStarted.current = true;
    startLoop();
  }, [resumeText, matchingOutput, gaps]); // eslint-disable-line react-hooks/exhaustive-deps

  const iterations = result && result.iterations ? result.iterations : [];
  const scores = normalizeScores(iterations);
  const hasResult = status === "done" && iterations.length > 0;

  let first = 0;
  let last = 0;
  let net = 0;
  let dropped = false;
  if (hasResult) {
    let bestIndex = scores.length - 1;
    for (let i = 0; i < iterations.length; i++) {
      if (iterations[i].iteration === result.best_iteration) bestIndex = i;
    }
    first = scores[0];
    last = scores[bestIndex];
    net = Math.round((last - first) * 10) / 10;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] < scores[i - 1]) dropped = true;
    }
    for (let i = 0; i < iterations.length; i++) {
      if (iterations[i].accepted === false) dropped = true;
    }
  }

  const agents = [
    { name: "Supervisor Agent", status: "done", label: "routed" },
    {
      name: "Matching Agent",
      status: status === "done" ? "done" : status === "loading" ? "working" : "idle",
      label: status === "done" ? "complete" : status === "loading" ? "re-scoring…" : "not run",
    },
    {
      name: "Resume Rewrite Agent",
      status: status === "done" ? "done" : status === "loading" ? "working" : "idle",
      label: status === "done" ? "complete" : status === "loading" ? "rewriting…" : "not run",
    },
  ];

  return (
    <div className="shell">
      <Sidebar />
      <section className="route" style={{ padding: "2rem" }}>
        <div className="page-head">
          <div>
            <span className="kicker"></span>
            <h1>Improvement loop</h1>
            <p>Each round rewrites the resume, then scores it against the job description again</p>
          </div>
          <div style={{ display: "flex", gap: "0.8rem" }}>
            <Link to="/resume-rewrite" state={state} className="btn secondary" style={{ textDecoration: "none" }}>
              Back to rewrite
            </Link>
            {status !== "loading" && resumeText ? (
              <button onClick={startLoop}>Run again</button>
            ) : null}
          </div>
        </div>

        <AgentStatusIndicator agents={agents} />

        {status === "loading" && (
          <div className="panel">
            <p>
              Running the loop. Every round rewrites the resume, re-scores it and re-checks the gaps, so this can take a few minutes. Keep this tab open.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="panel">
            <p style={{ color: "var(--gap)" }}>{errorMsg}</p>
          </div>
        )}

        {status === "done" && iterations.length === 0 && (
          <div className="panel">
            <p>The loop finished but returned no rounds. Try running it again.</p>
          </div>
        )}

        {hasResult && (
          <>
            <div className="panel loop-summary" style={{ marginTop: "1.2rem" }}>
              <div className="loop-stat">
                <span className="loop-stat-label">Score (best round)</span>
                <span className="loop-stat-value">{first + " to " + last}</span>
              </div>
              <div className="loop-stat">
                <span className="loop-stat-label">Net change</span>
                <span className={"loop-stat-value " + deltaClass(net)}>{formatDelta(net)}</span>
              </div>
              <div className="loop-stat">
                <span className="loop-stat-label">Rounds</span>
                <span className="loop-stat-value">{Math.max(iterations.length - 1, 0)}</span>
              </div>
              <div className="loop-stat">
                <span className="loop-stat-label">{result.finished ? "Stopped because" : "Status"}</span>
                <span className="loop-stat-text">
                  {result.finished ? result.stop_reason || "Stopping condition met" : "Not finished"}
                </span>
              </div>
            </div>

            {dropped && (
              <div className="panel" style={{ marginTop: "1.2rem", borderColor: "var(--gap)" }}>
                <h3>A round was discarded</h3>
                <p className="desc">
                  {"A round scored lower or added content that is not in your original resume, so it was thrown away. The final rewrite is from " +
                    (result.best_iteration > 0 ? "round " + result.best_iteration : "your original resume (no round improved it)") +
                    "."}
                </p>
              </div>
            )}

            <div className="panel" style={{ marginTop: "1.2rem" }}>
              <h3>Score by round</h3>
              <ScoreChart scores={scores} iterations={iterations} />
            </div>

            <div className="panel" style={{ marginTop: "1.2rem" }}>
              <h3>What changed each round</h3>
              <IterationBreakdown iterations={iterations} scores={scores} />
            </div>

            {result.final_version_id ? (
              <div className="callout" style={{ marginTop: "1.2rem" }}>
                <p>
                  {"Saved as version " + result.final_version_no + ". "}
                  <Link to="/resume-rewrite">Open it in Resume rewrite</Link> to see the highlighted changes and download it.
                </p>
              </div>
            ) : null}

            <div className="panel" style={{ marginTop: "1.2rem" }}>
              <h3>Before and after</h3>
              <div className="loop-compare">
                <div className="loop-pane">
                  <h4 className="loop-pane-title">Original resume</h4>
                  <pre className="loop-pane-text">
                    {result.original_resume || resumeText || ""}
                  </pre>
                </div>
                <div className="loop-pane loop-pane-after">
                  <h4 className="loop-pane-title">
                    {result.best_iteration > 0 ? "Final rewrite (round " + result.best_iteration + ")" : "Final result (original kept)"}
                  </h4>
                  <pre className="loop-pane-text">
                    {getFinalText(result, iterations) ||
                      "The loop response did not include the final text. Ask the backend to return final_resume, or load it from the versions route."}
                  </pre>
                </div>
              </div>
            </div>

            <div className="panel" style={{ marginTop: "1.2rem" }}>
              <h3>What next?</h3>
              <p className="desc">
                Look back at your earlier analyses, loop runs and resume versions, and compare any two of them.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", marginTop: "0.8rem" }}>
                <Link to="/history" className="btn" style={{ textDecoration: "none" }}>
                  View history
                </Link>
                <Link to="/resume-rewrite" state={state} className="btn secondary" style={{ textDecoration: "none" }}>
                  Back to rewrite
                </Link>
              </div>
            </div>
          </>
        )}

        <footer className="note">SkillGap AI</footer>
      </section>
    </div>
  );
}