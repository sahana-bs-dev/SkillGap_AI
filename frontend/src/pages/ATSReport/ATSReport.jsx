import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import AnalysisLoader from "../../components/AnalysisLoader";
import EmptyState from "../../components/EmptyState/EmptyState";
import { runATSAnalysis } from "../../api/analyzeApi";
import "./ATSReport.css";
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";

// Route: resume-only intake (Supervisor -> ATS Agent only, no JD).
// Expects the parsed resume text from the Upload page via router state:
//   navigate("/ats-report", { state: { resumeText, jdText } })

const ATS_MESSAGES = [
  "Reading your resume",
  "Checking formatting and structure",
  "Testing how ATS parsers read it",
  "Putting your report together",
];

/* ---------- small inline icons (no extra packages needed) ---------- */
const AlertIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 7v6M12 17h.01" />
  </svg>
);
const BulbIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
  </svg>
);
const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
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
    <div className={"ats-dial " + tierClass} role="img" aria-label={`ATS score ${safe} out of 100`}>
      <svg viewBox="0 0 130 130">
        <circle className="ats-dial-track" cx="65" cy="65" r={RING_R} />
        <circle
          className="ats-dial-fill"
          cx="65"
          cy="65"
          r={RING_R}
          strokeDasharray={RING_C}
          strokeDashoffset={offset}
          transform="rotate(-90 65 65)"
        />
      </svg>
      <div className="ats-dial-num">
        {shown}
        <span>/100</span>
      </div>
    </div>
  );
}

function tier(score) {
  if (score >= 80) return { label: "ATS friendly", cls: "strong" };
  if (score >= 60) return { label: "Needs polish", cls: "moderate" };
  return { label: "At risk", cls: "weak" };
}

/* ---------- list sections ---------- */
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function IssueRows({ issues }) {
  // most serious first (copy, so the report data is never mutated)
  const sorted = [...issues].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 1) - (SEVERITY_ORDER[b.severity] ?? 1)
  );
  return (
    <div className="ats-list">
      {sorted.map((issue, i) => (
        <div className="ats-item" key={"issue-" + i}>
          <div className="ats-item-main">
            <div className="ats-item-title">{issue.category}</div>
            <p className="ats-item-desc">{issue.message}</p>
          </div>
          <span className={"ats-pill " + severityClass(issue.severity)}>{issue.severity}</span>
        </div>
      ))}
    </div>
  );
}

function SuggestionRows({ suggestions }) {
  return (
    <div className="ats-list">
      {suggestions.map((text, i) => (
        <div className="ats-item ats-suggestion" key={"suggestion-" + i}>
          <span className="ats-idx">{String(i + 1).padStart(2, "0")}</span>
          <p className="ats-item-desc">{text}</p>
        </div>
      ))}
    </div>
  );
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


  const issueCount = report?.issues?.length ?? 0;
  const suggestionCount = report?.suggestions?.length ?? 0;
  const highCount = report ? report.issues.filter((x) => x.severity === "high").length : 0;
  const t = report ? tier(report.score) : null;

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

        {status === "loading" && (
          <AnalysisLoader
            title="Checking your resume"
            messages={ATS_MESSAGES}
            hint="This usually takes under a minute. Please keep this page open."
          />
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
          <div className="ats-page">
            {/* ---------- hero score card ---------- */}
            <div className="ats-hero">
              <ScoreDial score={report.score} tierClass={t.cls} />

              <div className="ats-hero-body">
                <span className="ats-eyebrow">ATS compatibility score</span>
                <div className="ats-hero-row">
                  <span className={"ats-tier " + t.cls}>{t.label}</span>
                </div>
                <p className="ats-hero-caption">{scoreCaption(report.score)}</p>

                <div className="ats-stats">
                  <div className="ats-stat">
                    <strong>{issueCount}</strong>
                    <span>Issues found</span>
                  </div>
                  <div className="ats-stat">
                    <strong className={highCount > 0 ? "high" : ""}>{highCount}</strong>
                    <span>High severity</span>
                  </div>
                  <div className="ats-stat">
                    <strong>{suggestionCount}</strong>
                    <span>Suggestions</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ---------- issues / suggestions ---------- */}
            <div className="ats-grid">
              <div className="ats-card">
                <div className="ats-card-head">
                  <span className="ats-badge bad"><AlertIcon /></span>
                  <h3>Parsing &amp; formatting issues</h3>
                  <span className="ats-count">{issueCount}</span>
                </div>
                {issueCount === 0 ? (
                  <p className="ats-empty"><CheckIcon /> No issues found — this resume parses cleanly.</p>
                ) : (
                  <IssueRows issues={report.issues} />
                )}
              </div>

              <div className="ats-card">
                <div className="ats-card-head">
                  <span className="ats-badge dark"><BulbIcon /></span>
                  <h3>Improvement suggestions</h3>
                  <span className="ats-count">{suggestionCount}</span>
                </div>
                {suggestionCount === 0 ? (
                  <p className="ats-empty"><CheckIcon /> No further suggestions.</p>
                ) : (
                  <SuggestionRows suggestions={report.suggestions} />
                )}
              </div>
            </div>

            {/* ---------- call to action ---------- */}
            <div className="ats-cta">
              <div>
                <h3>Ready to fix these?</h3>
                <p>Let the rewrite agent apply these fixes, then re-check your score.</p>
              </div>
              <Link to="/resume-rewrite" state={{ resumeText, atsReport: report }} className="ats-cta-btn">
                Rewrite my resume <ArrowIcon />
              </Link>
            </div>

            <div className="ats-cta">
              <div>
                <h3>Have a specific job in mind?</h3>
                <p>Add the job description to also see how well your resume matches it.</p>
              </div>
              <Link to="/upload" className="ats-cta-btn ghost">
                New analysis <ArrowIcon />
              </Link>
            </div>
          </div>
        )}

        <footer className="note">SkillGap AI</footer>
      </section>
    </div>
  );
}

function severityClass(severity) {
  if (severity === "high") return "high";
  if (severity === "low") return "low";
  return "medium";
}

function scoreCaption(score) {
  if (score >= 80) return "Parses cleanly across most applicant tracking systems.";
  if (score >= 60) return "Parses reasonably well, but a few formatting choices risk dropped sections.";
  return "Several formatting issues are likely causing content to be dropped or misread.";
}