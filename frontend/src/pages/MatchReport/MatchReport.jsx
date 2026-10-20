import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import AnalysisLoader from "../../components/AnalysisLoader";
import EmptyState from "../../components/EmptyState/EmptyState";
import { runMatchAnalysis } from "../../api/analyzeApi";
import "./MatchReport.css";
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";

// Route: resume+JD intake (Supervisor -> JD Analysis -> Matching Agent).
// Expects both texts from the Upload page via router state:
//   navigate("/match-report", { state: { resumeText, jdText } })

/* ---------- small inline icons (no extra packages needed) ---------- */
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const CrossIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/* ---------- animated score ring ---------- */
const RING_R = 54;
const RING_C = 2 * Math.PI * RING_R;

function ScoreDial({ score, tierClass }) {
  const safe = Math.max(0, Math.min(100, Number(score) || 0));
  const [shown, setShown] = useState(0);

  // count up + fill the ring once on mount
  useEffect(() => {
    let frame;
    const start = performance.now();
    const duration = 900;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(safe * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [safe]);

  const offset = RING_C * (1 - shown / 100);

  return (
    <div className={"mr-dial " + tierClass} role="img" aria-label={`Match score ${safe} out of 100`}>
      <svg viewBox="0 0 130 130">
        <circle className="mr-dial-track" cx="65" cy="65" r={RING_R} />
        <circle
          className="mr-dial-fill"
          cx="65"
          cy="65"
          r={RING_R}
          strokeDasharray={RING_C}
          strokeDashoffset={offset}
          transform="rotate(-90 65 65)"
        />
      </svg>
      <div className="mr-dial-num">
        {shown}
        <span>/100</span>
      </div>
    </div>
  );
}

function tier(score) {
  if (score >= 80) return { label: "Strong match", cls: "strong" };
  if (score >= 55) return { label: "Moderate match", cls: "moderate" };
  return { label: "Needs work", cls: "weak" };
}

/* ---------- list sections ---------- */
// "Git" / "git" or "Python" / "Python." is the same text twice, so only show
// the evidence line when it actually adds something.
const norm = (t) => String(t || "").toLowerCase().replace(/[^a-z0-9+#]+/g, " ").trim();
const addsInfo = (skill, evidence) => !!evidence && norm(evidence) !== norm(skill);

function MatchedRows({ matched }) {
  return (
    <div className="mr-list">
      {matched.map((m, i) => (
        <div className="mr-item" key={"matched-" + i}>
          <div className="mr-item-main">
            <div className="mr-item-title">{m.skill}</div>
            {addsInfo(m.skill, m.evidence) && <p className="mr-item-desc">{m.evidence}</p>}
          </div>
          <span className="mr-pill ok">Found</span>
        </div>
      ))}
    </div>
  );
}

function MissingRows({ missing }) {
  return (
    <div className="mr-list">
      {missing.map((skill, i) => (
        <div className="mr-item" key={"missing-" + i}>
          <div className="mr-item-main">
            <div className="mr-item-title">{skill}</div>
          </div>
          <span className="mr-pill bad">Missing</span>
        </div>
      ))}
    </div>
  );
}

function ExperienceRows({ experience }) {
  return (
    <div className="mr-list">
      {experience.map((text, i) => (
        <div className="mr-item mr-exp" key={"experience-" + i}>
          <span className="mr-exp-idx">{String(i + 1).padStart(2, "0")}</span>
          <p className="mr-item-desc">{text}</p>
        </div>
      ))}
    </div>
  );
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

  const matchedCount = report?.matched_skills?.length ?? 0;
  const missingCount = report?.missing_skills?.length ?? 0;
  const totalSkills = matchedCount + missingCount;
  const coverage = totalSkills ? Math.round((matchedCount / totalSkills) * 100) : 0;
  const t = report ? tier(report.score) : null;

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
          <div className="mr-page">
            {/* ---------- hero score card ---------- */}
            <div className="mr-hero">
              <ScoreDial score={report.score} tierClass={t.cls} />

              <div className="mr-hero-body">
                <span className="mr-eyebrow">Overall match score</span>
                <div className="mr-hero-row">
                  <span className={"mr-tier " + t.cls}>{t.label}</span>
                </div>
                <p className="mr-hero-caption">{scoreCaption(report.score)}</p>

                <div className="mr-stats">
                  <div className="mr-stat">
                    <strong>{matchedCount}</strong>
                    <span>Matched</span>
                  </div>
                  <div className="mr-stat">
                    <strong>{missingCount}</strong>
                    <span>Missing</span>
                  </div>
                  <div className="mr-stat">
                    <strong>{coverage}%</strong>
                    <span>Skill coverage</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ---------- matched / missing ---------- */}
            <div className="mr-grid">
              <div className="mr-card">
                <div className="mr-card-head">
                  <span className="mr-badge ok"><CheckIcon /></span>
                  <h3>Matched skills</h3>
                  <span className="mr-count">
                    {matchedCount}/{totalSkills}
                  </span>
                </div>
                {matchedCount === 0 ? (
                  <p className="mr-empty">No direct matches found.</p>
                ) : (
                  <MatchedRows matched={report.matched_skills} />
                )}
              </div>

              <div className="mr-card">
                <div className="mr-card-head">
                  <span className="mr-badge bad"><CrossIcon /></span>
                  <h3>Missing skills</h3>
                  <span className="mr-count">
                    {missingCount}/{totalSkills}
                  </span>
                </div>
                {missingCount === 0 ? (
                  <p className="mr-empty">No gaps found — great coverage.</p>
                ) : (
                  <MissingRows missing={report.missing_skills} />
                )}
              </div>
            </div>

            {/* ---------- relevant experience ---------- */}
            <div className="mr-card mr-wide">
              <div className="mr-card-head">
                <h3>Relevant experience</h3>
              </div>
              {report.relevant_experience.length === 0 ? (
                <p className="mr-empty">No specific experience highlighted for this role.</p>
              ) : (
                <ExperienceRows experience={report.relevant_experience} />
              )}
            </div>

            {/* ---------- call to action ---------- */}
            <div className="mr-cta">
              <div>
                <h3>Want a plan to close these gaps?</h3>
                <p>Get prioritised skills, project ideas and learning resources.</p>
              </div>
              <Link to="/skill-gap" state={{ matchingOutput: report, resumeText }} className="mr-cta-btn">
                View skill gap &amp; plan <ArrowIcon />
              </Link>
            </div>
          </div>
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