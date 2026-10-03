import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { jsPDF } from "jspdf";
import AgentStatusIndicator from "../../components/AgentStatus/AgentStatusIndicator";
import { runResumeRewrite } from "../../api/rewriteApi";
import "../MatchReport/MatchReport.css"; // reusing the same panel/row-list styles
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";

// Route: requires resumeText + matchingOutput + gaps from the Skill Gap page.
//   navigate("/resume-rewrite", { state: { resumeText, matchingOutput, gaps } })

function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ResumeRewrite() {
  const { state } = useLocation();
  const resumeText = state?.resumeText;
  const matchingOutput = state?.matchingOutput;
  const gaps = state?.gaps;

  const [status, setStatus] = useState("loading"); // 'loading' | 'done' | 'error'
  const [rewriteStage, setRewriteStage] = useState("idle");
  const [result, setResult] = useState(null); // { rewritten_text, diff_summary, warnings }
  const [errorMsg, setErrorMsg] = useState("");

  // Stops React dev mode from sending the request twice
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!resumeText || !matchingOutput || !gaps) {
      setStatus("error");
      setErrorMsg(
        "Missing resume text, match report, or skill gaps — go back and run the full flow from Upload."
      );
      return;
    }

    if (hasStarted.current) return;
    hasStarted.current = true;

    async function runRewrite() {
      setStatus("loading");
      setRewriteStage("working");
      try {
        const data = await runResumeRewrite(resumeText, matchingOutput, gaps);
        setResult(data);
        setRewriteStage("done");
        setStatus("done");
      } catch (err) {
        setErrorMsg(err.message);
        setStatus("error");
        setRewriteStage("error");
      }
    }

    runRewrite();
  }, [resumeText, matchingOutput, gaps]);

  function handleDownloadPdf() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 50;
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const lines = doc.splitTextToSize(result.rewritten_text, maxWidth);
    let y = margin;
    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 15;
    }

    doc.save("rewritten-resume.pdf");
  }

  async function handleDownloadDocx() {
    const lines = result.rewritten_text.split("\n");
    const paragraphs = [];
    for (const line of lines) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: line, font: "Calibri", size: 22 })],
        })
      );
    }

    const doc = new Document({ sections: [{ children: paragraphs }] });
    const blob = await Packer.toBlob(doc);
    saveBlob(blob, "rewritten-resume.docx");
  }

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
              <div style={{ display: "flex", gap: "0.8rem", marginTop: "1rem" }}>
                <button className="btn" onClick={handleDownloadPdf}>
                  Download PDF
                </button>
                <button className="btn secondary" onClick={handleDownloadDocx}>
                  Download Word
                </button>
              </div>
            </div>
          </>
        )}

        <footer className="note">SkillGap AI</footer>
      </section>
    </div>
  );
}