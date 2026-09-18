import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import AgentStatusIndicator from "../../components/AgentStatus/AgentStatusIndicator";
import ScoreRing from "../../components/ScoreRing";
import { runATSAnalysis } from "../../api/analyzeApi";
import "./ATSReport.css";
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";

// Route: resume-only intake (Supervisor -> ATS Agent only, no JD).
// Expects the parsed resume text from the Upload page via router state:
//   navigate("/ats-report", { state: { resumeText, jdText } })

export default function ATSReport() {
  const { state } = useLocation();
  const resumeText = state?.resumeText;

  const [status, setStatus] = useState("loading"); // 'loading' | 'done' | 'error'
  const [report, setReport] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!resumeText) {
      setStatus("error");
      setErrorMsg("No resume found for this report — start a new analysis.");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    runATSAnalysis(resumeText)
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
  }, [resumeText]);

  const agents = [
    { name: "Supervisor Agent", status: "done", label: "routed" },
    {
      name: "ATS Agent",
      status: status === "done" ? "done" : status === "error" ? "idle" : "working",
      label: status === "done" ? "complete" : status === "error" ? "failed" : "running…",
    },
    { name: "Matching Agent", status: "idle", label: "not run (no JD)" },
  ];

  return (
    <div className="shell">
      <Sidebar />
      <section className="route" style={{ padding: "2rem" }}>
        <div className="page-head">
          <div>
            <span className="kicker"></span>
            <h1>ATS compatibility report</h1>
            <p>Checked against common tracking-system parsers</p>
          </div>
          <Link to="/resume-rewrite" className="btn secondary">
            Fix with Rewrite Agent
          </Link>
        </div>

        <AgentStatusIndicator agents={agents} />

        {status === "loading" && (
          <div className="panel">
            <p>Running the ATS Agent…</p>
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
              variant="ats"
              caption={scoreCaption(report.score)}
            />

            <div className="grid-2" style={{ marginTop: "1.2rem" }}>
              <div className="panel">
                <h3>Parsing &amp; formatting issues</h3>
                {report.issues.length === 0 ? (
                  <p>No issues found — this resume parses cleanly.</p>
                ) : (
                  <div className="row-list">
                    {report.issues.map((issue, i) => (
                      <div className="row-item" key={i}>
                        <div>
                          <div className="label">{issue.category}</div>
                          <p className="desc">{issue.message}</p>
                        </div>
                        <span className={`tag ${severityTag(issue.severity)}`}>
                          {issue.severity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="panel">
                <h3>Improvement suggestions</h3>
                {report.suggestions.length === 0 ? (
                  <p>No further suggestions.</p>
                ) : (
                  <div className="row-list">
                    {report.suggestions.map((s, i) => (
                      <div className="row-item" key={i}>
                        <div>
                          <p className="desc">{s}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="callout" style={{ marginTop: "1.2rem" }}>
              <p>
                Have a specific job in mind? Add the job description to also run the JD
                Analysis and Matching Agents — <Link to="/upload">go to New analysis</Link>.
              </p>
            </div>
          </>
        )}

        <footer className="note">SkillGap AI</footer>
      </section>
    </div>
  );
}

function severityTag(severity) {
  if (severity === "high") return "gap";
  if (severity === "low") return "match";
  return "active"; // medium
}

function scoreCaption(score) {
  if (score >= 80) return "Parses cleanly across most applicant tracking systems.";
  if (score >= 60) return "Parses reasonably well, but a few formatting choices risk dropped sections.";
  return "Several formatting issues are likely causing content to be dropped or misread.";
}