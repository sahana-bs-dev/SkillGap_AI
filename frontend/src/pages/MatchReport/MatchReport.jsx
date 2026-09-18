import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import AgentStatusIndicator from "../../components/AgentStatus/AgentStatusIndicator";
import ScoreRing from "../../components/ScoreRing";
import { runMatchAnalysis } from "../../api/analyzeApi";
import "./MatchReport.css";
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";

// Route: resume+JD intake (Supervisor -> JD Analysis -> Matching Agent).
// Expects both texts from the Upload page via router state:
//   navigate("/match-report", { state: { resumeText, jdText } })

export default function MatchReport() {
  const { state } = useLocation();
  const resumeText = state?.resumeText;
  const jdText = state?.jdText;

  const [status, setStatus] = useState("loading"); // 'loading' | 'done' | 'error'
  const [report, setReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!resumeText || !jdText) {
      setStatus("error");
      setErrorMsg("Missing resume or job description — start a new analysis.");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    runMatchAnalysis(resumeText, jdText)
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        setStatus("done");
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(err.message);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [resumeText, jdText]);

  const agents = [
    { name: "Supervisor Agent", status: "done", label: "routed" },
    {
      name: "JD Analysis Agent",
      status: status === "loading" ? "working" : "done",
      label: status === "loading" ? "running…" : "complete",
    },
    {
      name: "Matching Agent",
      status: status === "done" ? "done" : status === "error" ? "idle" : "working",
      label: status === "done" ? "complete" : status === "error" ? "failed" : "running…",
    },
  ];

  return (
    <div className="shell">
      <Sidebar />
      <section className="route" style={{ padding: "2rem" }}>
        <div className="page-head">
          <div>
            <span className="kicker"></span>
            <h1>Match report</h1>
            <p>How your resume lines up against this job description</p>
          </div>
          <Link to="/skill-gap" className="btn secondary">
            View skill gap &amp; plan
          </Link>
        </div>

        <AgentStatusIndicator agents={agents} />

        {status === "loading" && (
          <div className="panel">
            <p>Running JD Analysis and Matching Agents…</p>
          </div>
        )}

        {status === "error" && (
          <div className="panel">
            <p style={{ color: "var(--gap)" }}>{errorMsg}</p>
          </div>
        )}

        {status === "done" && report && (
          <>
            <ScoreRing
              score={report.score}
              variant="match"
              caption={scoreCaption(report.score)}
            />

            <div className="grid-2" style={{ marginTop: "1.2rem" }}>
              <div className="panel">
                <h3>Matched skills</h3>
                {report.matched_skills.length === 0 ? (
                  <p>No direct matches found.</p>
                ) : (
                  <div className="row-list">
                    {report.matched_skills.map((m, i) => (
                      <div className="row-item" key={i}>
                        <div>
                          <div className="label">{m.skill}</div>
                          <p className="desc">{m.evidence}</p>
                        </div>
                        <span className="tag match">matched</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel">
                <h3>Missing skills</h3>
                {report.missing_skills.length === 0 ? (
                  <p>No gaps found — great coverage.</p>
                ) : (
                  <div className="row-list">
                    {report.missing_skills.map((skill, i) => (
                      <div className="row-item" key={i}>
                        <div>
                          <div className="label">{skill}</div>
                        </div>
                        <span className="tag gap">missing</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="panel" style={{ marginTop: "1.2rem" }}>
              <h3>Relevant experience</h3>
              {report.relevant_experience.length === 0 ? (
                <p>No specific experience highlighted for this role.</p>
              ) : (
                <div className="row-list">
                  {report.relevant_experience.map((exp, i) => (
                    <div className="row-item" key={i}>
                      <p className="desc">{exp}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="callout" style={{ marginTop: "1.2rem" }}>
              <p>
                Want a plan to close these gaps?{" "}
                <Link to="/skill-gap">View the skill gap &amp; learning plan</Link>.
              </p>
            </div>
          </>
        )}

        <footer className="note">SkillGap AI</footer>
      </section>
    </div>
  );
}

function scoreCaption(score) {
  if (score >= 80) return "Strong match — most of what this role asks for is already on your resume.";
  if (score >= 55) return "Decent overlap, but a few important gaps are worth closing.";
  return "Significant gaps between your resume and this role's requirements.";
}