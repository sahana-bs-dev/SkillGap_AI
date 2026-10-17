import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import AgentStatusIndicator from "../../components/AgentStatus/AgentStatusIndicator";
import { runResumeRewrite, listResumeVersions, getResumeVersion } from "../../api/rewriteApi";
import { diffText, buildSegments, diffStats } from "../../utils/textDiff";
import { parseResume, plainForDiff, resumeFileName } from "../../utils/resumeFormat";
import ResumePreview from "./ResumePreview";
import "../MatchReport/MatchReport.css"; // reusing the same panel/row-list styles
import "./ResumeRewrite.css";
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";

// Route: opened from the Skill Gap page with
//   navigate("/resume-rewrite", { state: { resumeText, matchingOutput, gaps } })
// A rewrite runs automatically in that case. Opened from the sidebar (no state),
// the page opens on the "Saved versions" tab.

/* ---------- helpers ---------- */

// The versions list returns UTC times without a "Z", which the browser would read as local time.
function formatDate(value) {
  if (!value) return "";
  const hasZone = /[zZ]$|[+-]\d\d:?\d\d$/.test(value);
  const date = new Date(hasZone ? value : value + "Z");
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// Remember the last rewrite for this tab so "Back to rewrite" from the loop page
// does not call the model again and save a duplicate version.
const CACHE_KEY = "skillgap_last_rewrite";

function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return String(hash);
}

function makeCacheKey(resumeText, matchingOutput, gaps) {
  const token = (localStorage.getItem("token") || "").slice(-12);
  return hashString(JSON.stringify([token, resumeText, matchingOutput, gaps]));
}

function readCache(key) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "null");
    if (saved && saved.key === key && saved.result) return saved.result;
  } catch {
    // ignore a broken cache entry
  }
  return null;
}

function writeCache(key, result) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ key: key, result: result }));
  } catch {
    // storage full or blocked: the page still works, it just will not cache
  }
}

function fromRewriteResult(result, originalText) {
  return {
    versionId: result.version_id,
    versionNo: result.version_no,
    createdAt: result.created_at,
    original: originalText,
    rewritten: result.rewritten_text,
    diffSummary: result.diff_summary || [],
    warnings: result.warnings || [],
  };
}

function fromSavedVersion(version) {
  return {
    versionId: version.id,
    versionNo: version.version_no,
    createdAt: version.created_at,
    original: version.original_text,
    rewritten: version.rewritten_text,
    diffSummary: version.diff_summary || [],
    warnings: version.warnings || [],
  };
}

const VIEW_HELP = {
  side: "Left is your original resume, right is the rewrite. Red words were removed and green words were added.",
  inline: "One copy of the resume. Red struck-through words were removed and green words were added.",
  preview: "This is how your resume will look when you download it.",
};

/* ---------- diff rendering ---------- */

function SegmentText({ segments }) {
  const nodes = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = i > 0 ? segments[i - 1] : null;
    const needSpace = prev && !prev.text.endsWith("\n") && !seg.text.startsWith("\n");
    nodes.push(
      <Fragment key={i}>
        {needSpace ? " " : ""}
        <span className={"rw-" + seg.type}>{seg.text}</span>
      </Fragment>
    );
  }
  return <pre className="rw-text">{nodes}</pre>;
}

function DiffView({ ops, mode, rewritten }) {
  const parts = useMemo(
    function () {
      return {
        inline: buildSegments(ops, "inline"),
        left: buildSegments(ops, "left"),
        right: buildSegments(ops, "right"),
      };
    },
    [ops]
  );

  if (mode === "preview") {
    return <ResumePreview text={rewritten} />;
  }

  if (mode === "inline") {
    return (
      <div className="rw-pane">
        <SegmentText segments={parts.inline} />
      </div>
    );
  }

  return (
    <div className="rw-columns">
      <div className="rw-pane">
        <h4 className="rw-pane-title">Your original</h4>
        <SegmentText segments={parts.left} />
      </div>
      <div className="rw-pane">
        <h4 className="rw-pane-title">Rewritten</h4>
        <SegmentText segments={parts.right} />
      </div>
    </div>
  );
}

/* ---------- page ---------- */

export default function ResumeRewrite() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const resumeText = state?.resumeText;
  const matchingOutput = state?.matchingOutput;
  const gaps = state?.gaps;
  const hasInputs = Boolean(resumeText && matchingOutput && gaps);

  const [pageTab, setPageTab] = useState(hasInputs ? "review" : "saved"); // 'review' | 'saved'
  const [status, setStatus] = useState(hasInputs ? "loading" : "idle"); // 'idle' | 'loading' | 'done' | 'error'
  const [rewriteStage, setRewriteStage] = useState("idle");
  const [fresh, setFresh] = useState(null); // the rewrite from this visit
  const [selected, setSelected] = useState(null); // an older saved version the person opened
  const [errorMsg, setErrorMsg] = useState("");
  const [viewMode, setViewMode] = useState("side"); // 'side' | 'inline' | 'preview'
  const [exporting, setExporting] = useState(""); // '' | 'pdf' | 'docx'
  const [exportError, setExportError] = useState("");

  const [versions, setVersions] = useState([]);
  const [versionsStatus, setVersionsStatus] = useState("loading"); // 'loading' | 'done' | 'error'
  const [versionsError, setVersionsError] = useState("");
  const [openingId, setOpeningId] = useState("");
  const [openError, setOpenError] = useState("");

  // Stops React dev mode from sending the request twice
  const hasStarted = useRef(false);
  const versionsRequest = useRef(0);

  const current = selected || fresh;

  const ops = useMemo(
    function () {
      return current ? diffText(plainForDiff(current.original), plainForDiff(current.rewritten)) : [];
    },
    [current]
  );
  const stats = diffStats(ops);

  async function refreshVersions() {
    const requestId = ++versionsRequest.current;
    setVersionsStatus("loading");
    try {
      const list = await listResumeVersions();
      if (requestId !== versionsRequest.current) return; // a newer request replaced this one
      setVersions(list);
      setVersionsStatus("done");
    } catch (err) {
      if (requestId !== versionsRequest.current) return;
      setVersionsError(err.message);
      setVersionsStatus("error");
    }
  }

  async function runRewrite(force) {
    setStatus("loading");
    setRewriteStage("working");
    setErrorMsg("");
    setPageTab("review");

    const key = makeCacheKey(resumeText, matchingOutput, gaps);
    if (!force) {
      const cached = readCache(key);
      if (cached) {
        setFresh(fromRewriteResult(cached, resumeText));
        setRewriteStage("done");
        setStatus("done");
        return;
      }
    }

    try {
      const data = await runResumeRewrite(resumeText, matchingOutput, gaps);
      writeCache(key, data);
      setFresh(fromRewriteResult(data, resumeText));
      setSelected(null);
      setRewriteStage("done");
      setStatus("done");
      refreshVersions(); // the new version was saved by the backend, so list it
    } catch (err) {
      setErrorMsg(err.message);
      setStatus("error");
      setRewriteStage("error");
    }
  }

  // Load the saved versions once when the page opens (status already starts as "loading").
  useEffect(() => {
    const requestId = ++versionsRequest.current;
    listResumeVersions()
      .then((list) => {
        if (requestId !== versionsRequest.current) return;
        setVersions(list);
        setVersionsStatus("done");
      })
      .catch((err) => {
        if (requestId !== versionsRequest.current) return;
        setVersionsError(err.message);
        setVersionsStatus("error");
      });
  }, []);

  useEffect(() => {
    if (!resumeText || !matchingOutput || !gaps) return; // no inputs: stay in the "idle" state
    if (hasStarted.current) return;
    hasStarted.current = true;
    runRewrite(false);
  }, [resumeText, matchingOutput, gaps]); // eslint-disable-line react-hooks/exhaustive-deps

  async function openVersion(versionId) {
    setOpeningId(versionId);
    setOpenError("");
    try {
      const version = await getResumeVersion(versionId);
      setSelected(fromSavedVersion(version));
      setPageTab("review");
    } catch (err) {
      setOpenError(err.message);
    } finally {
      setOpeningId("");
    }
  }

  // Both files are built on click, so the PDF/Word code only loads when it is needed.
  async function handleDownload(kind) {
    setExporting(kind);
    setExportError("");
    try {
      const fileName = resumeFileName(parseResume(current.rewritten), kind);
      if (kind === "pdf") {
        const { downloadResumePdf } = await import("../../utils/resumePdf");
        downloadResumePdf(current.rewritten, fileName);
      } else {
        const { downloadResumeDocx } = await import("../../utils/resumeDocx");
        await downloadResumeDocx(current.rewritten, fileName);
      }
    } catch (err) {
      setExportError("Could not create the file: " + err.message);
    } finally {
      setExporting("");
    }
  }

  // Phase 8: hand the same inputs to the improvement loop page
  function handleRunLoop() {
    navigate("/improvement-loop", { state: { resumeText, matchingOutput, gaps } });
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

  const viewingOlder = Boolean(selected);
  const showLoading = status === "loading" && !selected;
  const showError = status === "error" && !selected;
  const showIdle = status === "idle" && !selected;
  const showResult = Boolean(current) && (current === selected || status === "done");
  const reviewCount = current ? current.warnings.length : 0;
  const noChanges = stats.added === 0 && stats.removed === 0;

  return (
    <div className="shell">
      <Sidebar />
      <section className="route rw-page" style={{ padding: "2rem" }}>
        <div className="page-head">
          <div>
            <span className="kicker"></span>
            <h1>Resume rewrite</h1>
            <p>
              We reword your resume to fit the job. We only rephrase what you already wrote — we never add skills,
              employers or numbers you did not give us.
            </p>
          </div>
          <Link to="/skill-gap" className="btn secondary">
            Back to skill gap plan
          </Link>
        </div>

        {hasInputs && <AgentStatusIndicator agents={agents} />}

        <div className="rw-pagetabs" role="tablist" aria-label="Resume rewrite sections">
          <button
            className={"rw-pagetab" + (pageTab === "review" ? " active" : "")}
            onClick={() => setPageTab("review")}
            role="tab"
            aria-selected={pageTab === "review"}
          >
            Review &amp; download
          </button>
          <button
            className={"rw-pagetab" + (pageTab === "saved" ? " active" : "")}
            onClick={() => setPageTab("saved")}
            role="tab"
            aria-selected={pageTab === "saved"}
          >
            Saved versions{versionsStatus === "done" ? " (" + versions.length + ")" : ""}
          </button>
        </div>

        {/* ================= REVIEW & DOWNLOAD ================= */}
        {pageTab === "review" && (
          <>
            {viewingOlder && (
              <div className="panel rw-viewing" style={{ borderColor: "var(--gold)" }}>
                <span>
                  You are looking at a <strong>saved version (version {selected.versionNo})</strong>
                  {selected.createdAt ? " from " + formatDate(selected.createdAt) : ""}.
                </span>
                <button className="btn secondary" onClick={() => (fresh ? setSelected(null) : setPageTab("saved"))}>
                  {fresh ? "Back to this session's rewrite" : "Back to saved versions"}
                </button>
              </div>
            )}

            {showIdle && (
              <div className="panel">
                <h3>Nothing to review yet</h3>
                <p className="desc">
                  A rewrite starts from the skill gap plan after you match your resume to a job.{" "}
                  <Link to="/upload">Start a new analysis</Link>, or open one of your{" "}
                  <button className="rw-linkbtn" onClick={() => setPageTab("saved")}>
                    saved versions
                  </button>
                  .
                </p>
              </div>
            )}

            {showLoading && (
              <div className="panel">
                <h3>Rewriting your resume…</h3>
                <p className="desc">
                  This usually takes 10 to 30 seconds. We are rewording your own content to fit the job, and checking that
                  nothing new was invented.
                </p>
              </div>
            )}

            {showError && (
              <div className="panel">
                <h3>The rewrite did not finish</h3>
                <p style={{ color: "var(--gap)" }}>{errorMsg}</p>
                {hasInputs && (
                  <button className="btn secondary" onClick={() => runRewrite(true)}>
                    Try again
                  </button>
                )}
              </div>
            )}

            {showResult && (
              <>
                {/* 1. what you have + download */}
                <div className="panel rw-hero">
                  <div className="rw-hero-top">
                    <div>
                      <span className={"tag " + (reviewCount > 0 ? "gap" : "match")}>
                        {reviewCount > 0 ? "Check before you use it" : "Ready to use"}
                      </span>
                      <h3 className="rw-hero-title">
                        {viewingOlder ? "Version " + current.versionNo : "Your rewritten resume is ready"}
                      </h3>
                      <p className="desc">
                        {current.versionNo ? "Saved automatically as version " + current.versionNo : "Saved automatically"}
                        {current.createdAt ? " · " + formatDate(current.createdAt) : ""}
                      </p>
                    </div>
                    <div className="rw-stats">
                      <div className="rw-stat">
                        <span className="rw-stat-value rw-plus">+{stats.added}</span>
                        <span className="rw-stat-label">words added</span>
                      </div>
                      <div className="rw-stat">
                        <span className="rw-stat-value rw-minus">−{stats.removed}</span>
                        <span className="rw-stat-label">words removed</span>
                      </div>
                      <div className="rw-stat">
                        <span className={"rw-stat-value" + (reviewCount > 0 ? " rw-minus" : "")}>{reviewCount}</span>
                        <span className="rw-stat-label">to check</span>
                      </div>
                    </div>
                  </div>

                  <div className="rw-actions">
                    <button className="btn" onClick={() => handleDownload("pdf")} disabled={Boolean(exporting)}>
                      {exporting === "pdf" ? "Preparing PDF…" : "Download PDF"}
                    </button>
                    <button className="btn secondary" onClick={() => handleDownload("docx")} disabled={Boolean(exporting)}>
                      {exporting === "docx" ? "Preparing Word file…" : "Download Word"}
                    </button>
                  </div>
                  <p className="desc rw-small">
                    The PDF is laid out as a clean, ATS-friendly A4 resume. The Word file has the same layout and stays
                    editable.
                  </p>
                  {exportError && <p style={{ color: "var(--gap)" }}>{exportError}</p>}
                </div>

                {/* 2. things to check */}
                {current.warnings.length > 0 && (
                  <div className="panel" style={{ marginTop: "1.2rem", borderColor: "var(--gap)" }}>
                    <h3>Check these before you use the resume</h3>
                    <p className="desc">
                      These items appear in the rewrite but were not found in your original resume. Remove or correct
                      anything that is not true.
                    </p>
                    <div className="row-list">
                      {current.warnings.map((w, i) => (
                        <div className="row-item" key={i}>
                          <p className="desc">{w}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. what changed */}
                <div className="panel" style={{ marginTop: "1.2rem" }}>
                  <h3>What we changed</h3>
                  <div className="row-list">
                    {current.diffSummary.length ? (
                      current.diffSummary.map((d, i) => (
                        <div className="row-item" key={i}>
                          <p className="desc">{d}</p>
                        </div>
                      ))
                    ) : (
                      <p className="desc">No summary returned.</p>
                    )}
                  </div>
                </div>

                {/* 4. compare */}
                <div className="panel" style={{ marginTop: "1.2rem" }}>
                  <h3>See it for yourself</h3>

                  <div className="rw-toolbar">
                    <div className="rw-tabs" role="tablist" aria-label="Comparison view">
                      <button className={"rw-tab" + (viewMode === "side" ? " active" : "")} onClick={() => setViewMode("side")}>
                        Side by side
                      </button>
                      <button className={"rw-tab" + (viewMode === "inline" ? " active" : "")} onClick={() => setViewMode("inline")}>
                        Highlighted changes
                      </button>
                      <button className={"rw-tab" + (viewMode === "preview" ? " active" : "")} onClick={() => setViewMode("preview")}>
                        Resume preview
                      </button>
                    </div>
                  </div>

                  <p className="desc rw-small">
                    {viewMode !== "preview" && noChanges ? "The rewrite is identical to your original resume." : VIEW_HELP[viewMode]}
                  </p>

                  <DiffView ops={ops} mode={viewMode} rewritten={current.rewritten} />
                </div>

                {/* 5. next step */}
                {hasInputs && !viewingOlder && (
                  <div className="panel" style={{ marginTop: "1.2rem" }}>
                    <h3>Want a higher match score?</h3>
                    <p className="desc">
                      The improvement loop scores this rewrite against the job, then rewrites it again, for up to 3 rounds.
                      It keeps the best version and never adds skills you do not have. It takes a few minutes.
                    </p>
                    <div className="rw-actions">
                      <button className="btn" onClick={handleRunLoop}>
                        Run improvement loop
                      </button>
                      <button className="btn ghost" onClick={() => runRewrite(true)} disabled={status === "loading"}>
                        Make a different rewrite
                      </button>
                    </div>
                    <p className="desc rw-small">&ldquo;Make a different rewrite&rdquo; runs the rewrite again and saves the result as a new version.</p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ================= SAVED VERSIONS ================= */}
        {pageTab === "saved" && (
          <div className="panel">
            <h3>Saved versions</h3>
            <p className="desc">
              Every time you rewrite your resume, a copy is saved here automatically so you can come back to it. Open one to
              see what changed or to download it again.
            </p>

            {versionsStatus === "loading" && versions.length === 0 && <p className="desc">Loading your saved versions…</p>}

            {versionsStatus === "error" && (
              <p style={{ color: "var(--gap)" }}>
                {versionsError}{" "}
                <button className="btn ghost" onClick={refreshVersions}>
                  Retry
                </button>
              </p>
            )}

            {openError && <p style={{ color: "var(--gap)" }}>{openError}</p>}

            {versionsStatus === "done" && versions.length === 0 && (
              <p className="desc">
                You have no saved versions yet. Your first rewrite will appear here.
              </p>
            )}

            {versions.length > 0 && (
              <div className="rw-vlist">
                {versions.map((v, index) => {
                  const isActive = Boolean(current) && current.versionId === v.id;
                  return (
                    <div className={"rw-vcard" + (isActive ? " rw-vcard-active" : "")} key={v.id}>
                      <div className="rw-vcard-main">
                        <div className="rw-version-head">
                          <span className="rw-version-name">Version {v.version_no}</span>
                          {index === 0 && <span className="tag active">Latest</span>}
                          {v.source === "improvement_loop" && <span className="tag">From improvement loop</span>}
                          {v.warning_count > 0 && (
                            <span className="tag gap">
                              {v.warning_count} to check
                            </span>
                          )}
                        </div>
                        <p className="rw-vcard-summary">{v.summary || "Rewritten resume"}</p>
                        <span className="rw-version-date">
                          {formatDate(v.created_at)}
                          {v.change_count > 0 ? " · " + v.change_count + (v.change_count === 1 ? " change" : " changes") + " listed" : ""}
                        </span>
                      </div>
                      <button className="btn secondary" onClick={() => openVersion(v.id)} disabled={openingId === v.id}>
                        {openingId === v.id ? "Opening…" : isActive ? "Open again" : "Open"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <footer className="note">SkillGap AI</footer>
      </section>
    </div>
  );
}