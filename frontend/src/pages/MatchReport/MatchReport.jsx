import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import AnalysisLoader from "../../components/AnalysisLoader";
import EmptyState from "../../components/EmptyState/EmptyState";
import ScoreRing from "../../components/ScoreRing";
import { runMatchAnalysis } from "../../api/analyzeApi";
import "./MatchReport.css";
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";

// Route: resume+JD intake (Supervisor -> JD Analysis -> Matching Agent).
// Expects both texts from the Upload page via router state:
//   navigate("/match-report", { state: { resumeText, jdText } })

function MatchedRows({ matched }) {
  const rows = [];
  for (let i = 0; i < matched.length; i++) {
    rows.push(
      <div className="row-item" key={"matched-" + i}>
        <div>
          <div className="label">{matched[i].skill}</div>
          <p className="desc">{matched[i].evidence}</p>
        </div>
      </div>
    );
  }
  return <div className="row-list">{rows}</div>;
}

function MissingRows({ missing }) {
  const rows = [];
  for (let i = 0; i < missing.length; i++) {
    rows.push(
      <div className="row-item" key={"missing-" + i}>
        <div>
          <div className="label">{missing[i]}</div>
        </div>
      </div>
    );
  }
  return <div className="row-list">{rows}</div>;
}

function ExperienceRows({ experience }) {
  const rows = [];
  for (let i = 0; i < experience.length; i++) {
    rows.push(
      <div className="row-item" key={"experience-" + i}>
        <p className="desc">{experience[i]}</p>
      </div>
    );
  }
  return <div className="row-list">{rows}</div>;
}

export default function MatchReport() {
  const { state } = useLocation();
  const resumeText = state?.resumeText;
  const jdText = state?.jdText;

  // 'empty' = no resume / job description yet, 'loading' | 'done' | 'error' as before
  const [status, setStatus] = useState("loading");
  const [report, setReport] = useState(null);
  const [attempt, setAttempt] = useState(0); // goes up by one on "Try again"

  useEffect(() => {
    if (!resumeText || !jdText) {
      setStatus("empty");
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
        // The real error stays in the console for you; the user sees a friendly message.
        console.error("Match analysis failed:", err);
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [resumeText, jdText, attempt]);

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
          {status === "done" && report && (
            <Link to="/skill-gap" state={{ matchingOutput: report, resumeText }} className="btn secondary">
              View skill gap &amp; plan
            </Link>
          )}
        </div>

        {status === "loading" && <AnalysisLoader />}

        {status === "empty" && (
          <EmptyState
            title="No match to show yet"
            message="Add your resume and a job description to see how well they line up."
            actionLabel="Start a new analysis"
            actionTo="/upload"
          />
        )}

        {status === "error" && (
          <EmptyState
            title="We couldn't compare your resume"
            message="Something went wrong while matching your resume to this job. Please try again."
            actionLabel="Try again"
            onAction={() => setAttempt(attempt + 1)}
          />
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
                  <MatchedRows matched={report.matched_skills} />
                )}
              </div>

              <div className="panel">
                <h3>Missing skills</h3>
                {report.missing_skills.length === 0 ? (
                  <p>No gaps found — great coverage.</p>
                ) : (
                  <MissingRows missing={report.missing_skills} />
                )}
              </div>
            </div>

            <div className="panel" style={{ marginTop: "1.2rem" }}>
              <h3>Relevant experience</h3>
              {report.relevant_experience.length === 0 ? (
                <p>No specific experience highlighted for this role.</p>
              ) : (
                <ExperienceRows experience={report.relevant_experience} />
              )}
            </div>

            <div className="callout" style={{ marginTop: "1.2rem" }}>
              <p>
                Want a plan to close these gaps?{" "}
                <Link to="/skill-gap" state={{ matchingOutput: report, resumeText }}>View the skill gap &amp; learning plan</Link>
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