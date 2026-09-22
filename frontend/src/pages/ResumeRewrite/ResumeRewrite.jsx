import { useEffect, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import AgentStatusIndicator from "../../components/AgentStatus/AgentStatusIndicator";
import { runResumeRewrite } from "../../api/rewriteApi";
import "../MatchReport/MatchReport.css"; // reusing the same panel/row-list styles
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";

// Route: requires resumeText + matchingOutput + gaps from the Skill Gap page.
//   navigate("/resume-rewrite", { state: { resumeText, matchingOutput, gaps } })

export default function ResumeRewrite() {
  const { state } = useLocation();
  const resumeText = state?.resumeText;
  const matchingOutput = state?.matchingOutput;
  const gaps = state?.gaps;

  const [status, setStatus] = useState("loading"); // 'loading' | 'done' | 'error'
  const [rewriteStage, setRewriteStage] = useState("idle");
  const [result, setResult] = useState(null); // { rewritten_text, diff_summary, warnings }
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!resumeText || !matchingOutput || !gaps) {
      setStatus("error");
      setErrorMsg(
        "Missing resume text, match report, or skill gaps — go back and run the full flow from Upload."
      );
      return;
    }

    let cancelled = false;

    async function runRewrite() {
      setStatus("loading");
      setRewriteStage("working");
      try {
        const data = await runResumeRewrite(resumeText, matchingOutput, gaps);
        if (cancelled) return;
        setResult(data);
        setRewriteStage("done");
        setStatus("done");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err.message);
        setStatus("error");
        setRewriteStage("error");
      }
    }

    runRewrite();
    return () => {
      cancelled = true;
    };
  }, [resumeText, matchingOutput, gaps]);

  const agents = [
    { name: "Supervisor Agent", status: "done", label: "routed" },
    {
      name: "Resume Rewrite Agent",
      status: rewriteStage === "done" ? "done" : rewriteStage === "error" ? "idle" : rewriteStage === "working" ? "working" : "idle",
      label:
        rewriteStage === "done" ? "complete" :
        rewriteStage === "error" ? "failed" :
        rewriteStage === "working" ? "running…" : "not run",
    },
  ];

  return (
    <div className="shell">
      <Sidebar />
      <section className="route" style={{ padding: "2rem" }}>
        <div className="page-head">
          <div>
            <span className="kicker"></span>
            <h1>Resume rewrite</h1>
            <p>AI-rewritten resume targeting the gaps from your skill gap plan — no fabricated content</p>
          </div>
          <Link to="/skill-gap" className="btn secondary">
            Back to skill gap plan
          </Link>
        </div>

        <AgentStatusIndicator agents={agents} />

        {status === "loading" && (
          <div className="panel">
            <p>Running the Resume Rewrite Agent…</p>
          </div>
        )}

        {status === "error" && (
          <div className="panel">
            <p style={{ color: "var(--gap)" }}>{errorMsg}</p>
          </div>
        )}

        {status === "done" && result && (
          <>
            {result.warnings?.length > 0 && (
              <div className="panel" style={{ marginTop: "1.2rem", borderColor: "var(--gap)" }}>
                <h3>Warnings</h3>
                <div className="row-list">
                  {result.warnings.map((w, i) => (
                    <div className="row-item" key={i}>
                      <p className="desc">{w}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="panel" style={{ marginTop: "1.2rem" }}>
              <h3>What changed</h3>
              <div className="row-list">
                {result.diff_summary?.length ? (
                  result.diff_summary.map((d, i) => (
                    <div className="row-item" key={i}>
                      <p className="desc">{d}</p>
                    </div>
                  ))
                ) : (
                  <p className="desc">No summary returned.</p>
                )}
              </div>
            </div>

            <div className="panel" style={{ marginTop: "1.2rem" }}>
              <h3>Rewritten resume</h3>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  fontSize: "0.95rem",
                  lineHeight: 1.5,
                }}
              >
                {result.rewritten_text}
              </pre>
            </div>
          </>
        )}

        <footer className="note">SkillGap AI</footer>
      </section>
    </div>
  );
}