import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import AgentStatusIndicator from "../../components/AgentStatus/AgentStatusIndicator";
import EmptyState from "../../components/EmptyState/EmptyState";
import ScoreRing from "../../components/ScoreRing";
import { runATSAnalysis } from "../../api/analyzeApi";
import "./ATSReport.css";
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";

// Route: resume-only intake (Supervisor -> ATS Agent only, no JD).
// Expects the parsed resume text from the Upload page via router state:
//   navigate("/ats-report", { state: { resumeText, jdText } })

function IssueRows({ issues }) {
  const rows = [];
  for (let i = 0; i < issues.length; i++) {
    rows.push(
      <div className="row-item" key={"issue-" + i}>
        <div>
          <div className="label">{issues[i].category}</div>
          <p className="desc">{issues[i].message}</p>
        </div>
        <span className={"tag " + severityTag(issues[i].severity)}>{issues[i].severity}</span>
      </div>
    );
  }
  return <div className="row-list">{rows}</div>;
}

function SuggestionRows({ suggestions }) {
  const rows = [];
  for (let i = 0; i < suggestions.length; i++) {
    rows.push(
      <div className="row-item" key={"suggestion-" + i}>
        <div>
          <p className="desc">{suggestions[i]}</p>
        </div>
      </div>
    );
  }
  return <div className="row-list">{rows}</div>;
}

export default function ATSReport() {
  const { state } = useLocation();
  const resumeText = state?.resumeText;

  // 'empty' = no resume to check yet, 'loading' | 'done' | 'error' as before
  const [status, setStatus] = useState("loading");
  const [report, setReport] = useState(null);
  const [attempt, setAttempt] = useState(0); // goes up by one on "Try again"

  useEffect(() => {
    if (!resumeText) {
      setStatus("empty");
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
        // The real error stays in the console for you; the user sees a friendly message.
        console.error("ATS analysis failed:", err);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [resumeText, attempt]);

  // The agent progress strip only shows while the analysis is running or finished.
  const agents = [
    { name: "Supervisor Agent", status: "done", label: "routed" },
    {
      name: "ATS Agent",
      status: status === "done" ? "done" : "working",
      label: status === "done" ? "complete" : "running…",
    },
  ];
  const showAgents = status === "loading" || status === "done";

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
          {/* Sends the resume and this ATS report to the rewrite page, which fixes
              the issues found here and then offers to re-check the score. */}
          {status === "done" && report && (
            <Link to="/resume-rewrite" state={{ resumeText, atsReport: report }} className="btn">
              Fix it by rewriting resume
            </Link>
          )}
        </div>

        {showAgents ? <AgentStatusIndicator agents={agents} /> : null}

        {status === "loading" && (
          <div className="panel">
            <p>Checking your resume…</p>
          </div>
        )}

        {status === "empty" && (
          <EmptyState
            title="No resume to check yet"
            message="Upload or paste your resume to see how well it reads to applicant tracking systems."
            actionLabel="Start a new analysis"
            actionTo="/upload"
          />
        )}

        {status === "error" && (
          <EmptyState
            title="We couldn't check your resume"
            message="Something went wrong while checking your resume. Please try again."
            actionLabel="Try again"
            onAction={() => setAttempt(attempt + 1)}
          />
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
                  <IssueRows issues={report.issues} />
                )}
              </div>

              <div className="panel">
                <h3>Improvement suggestions</h3>
                {report.suggestions.length === 0 ? (
                  <p>No further suggestions.</p>
                ) : (
                  <SuggestionRows suggestions={report.suggestions} />
                )}
              </div>
            </div>

            <div className="callout" style={{ marginTop: "1.2rem" }}>
              <p>
                Have a specific job in mind? Add the job description to also see how well your
                resume matches it — <Link to="/upload">go to New analysis</Link>.
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