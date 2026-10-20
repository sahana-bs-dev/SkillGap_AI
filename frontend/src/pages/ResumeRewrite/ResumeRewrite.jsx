import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import AnalysisLoader from "../../components/AnalysisLoader";
import { runResumeRewrite, listResumeVersions, getResumeVersion } from "../../api/rewriteApi";
import { runATSAnalysis } from "../../api/analyzeApi";
import { getPlan } from "../../api/skillPlanApi";
import { diffText, buildSegments, diffStats } from "../../utils/textDiff";
import { parseResume, plainForDiff, resumeFileName } from "../../utils/resumeFormat";
import ResumePreview from "./ResumePreview";
import "../MatchReport/MatchReport.css"; // reusing the same panel/row-list styles
import "./ResumeRewrite.css";
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";

// Route: opened from the Skill Gap page with
//   navigate("/resume-rewrite", { state: { resumeText, matchingOutput, gaps } })
// or from the ATS report with
//   navigate("/resume-rewrite", { state: { resumeText, atsReport } })
// A rewrite runs automatically in either case. Opened from the sidebar (no state),
// the page opens on the "Saved versions" tab.
// From the Skill gap page's "Add learned skills" button the state also has a planId. Then the page
// first lists the learned skills (read from the saved plan) so the person can untick any, and the
// rewrite only starts when they click the button.

const JOB_LOADER_MESSAGES = [
  "Reading your resume",
  "Rewording it to fit the job",
  "Checking that nothing new was invented",
  "Getting your files ready",
];

const ATS_LOADER_MESSAGES = [
  "Reading your resume",
  "Fixing the problems the check found",
  "Checking that nothing new was invented",
  "Getting your files ready",
];

/* ---------- helpers ---------- */

// The versions list returns UTC times without a "Z", which the browser would read as local time.
function formatDate(value) {
  if (!value) return "";
  const hasZone = /[zZ]$|[+-]\d\d:?\d\d$/.test(value);
  const date = new Date(hasZone ? value : value + "Z");
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// Remember the last rewrite for this tab so coming back to this page
// does not call the model again and save a duplicate version.
const CACHE_KEY = "skillgap_last_rewrite";

function hashString(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return String(hash);
}

function makeCacheKey(resumeText, matchingOutput, gaps, atsReport, learnedKey) {
  const token = (localStorage.getItem("token") || "").slice(-12);
  return hashString(JSON.stringify([token, resumeText, matchingOutput, gaps, atsReport, learnedKey || null]));
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
    scores: result.scores || null,
  };
}

// "ATS 65 → 72 · Match 20 → 58" for the scores saved with a rewrite, or "" when there are none.
function describeScores(scores) {
  if (!scores) return "";
  const part = (label, before, after) =>
    typeof after === "number" ? label + " " + (typeof before === "number" ? before + " → " : "") + after : "";
  return [part("ATS", scores.ats_before, scores.ats_after), part("Match", scores.match_before, scores.match_after)]
    .filter(Boolean)
    .join(" · ");
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
    scores: version.scores || null,
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

// "Section: what happened" -> { label: "Section", body: "what happened" }.
// Used to lay the warnings and the change list out as a label + sentence.
function splitLabel(text) {
  const s = String(text || "");
  const i = s.indexOf(": ");
  if (i > 0 && i <= 60) return { label: s.slice(0, i).trim(), body: s.slice(i + 2).trim() };
  return { label: "", body: s };
}

export default function ResumeRewrite() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const resumeText = state?.resumeText;
  const matchingOutput = state?.matchingOutput;
  const gaps = state?.gaps;
  const atsReport = state?.atsReport;
  const planId = state?.planId;
  // ATS-fix mode: opened from the ATS report, so there is no job to tailor to.
  const atsMode = Boolean(resumeText && atsReport && !matchingOutput);
  const hasInputs = Boolean(resumeText && ((matchingOutput && gaps) || atsMode));
  // Learned-skills mode: the person chooses which learned skills to add before the rewrite starts.
  const pickMode = Boolean(planId && hasInputs && !atsMode);

  const [pageTab, setPageTab] = useState(hasInputs ? "review" : "saved"); // 'review' | 'saved'
  const [status, setStatus] = useState(hasInputs && !pickMode ? "loading" : "idle"); // 'idle' | 'loading' | 'done' | 'error'
  const [fresh, setFresh] = useState(null); // the rewrite from this visit
  const [selected, setSelected] = useState(null); // an older saved version the person opened
  const [errorMsg, setErrorMsg] = useState("");
  const [viewMode, setViewMode] = useState("side"); // 'side' | 'inline' | 'preview'
  const [exporting, setExporting] = useState(""); // '' | 'pdf' | 'docx'
  const [exportError, setExportError] = useState("");

  // Learned skills read from the saved plan: { skill, project }[]; picked = names that stay ticked.
  const [learnedState, setLearnedState] = useState(pickMode ? "loading" : "idle"); // 'idle' | 'loading' | 'done' | 'error'
  const [learned, setLearned] = useState([]);
  const [picked, setPicked] = useState({}); // { skillName: true }
  const [learnedError, setLearnedError] = useState("");

  // ATS re-check of the rewritten resume (ATS-fix mode only)
  const [recheck, setRecheck] = useState({ status: "idle", report: null, error: "" }); // status: 'idle' | 'loading' | 'done' | 'error'

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

  async function loadLearned() {
    setLearnedState("loading");
    setLearnedError("");
    try {
      const plan = await getPlan(planId);
      const list = plan?.progress?.learned_skills || [];
      setLearned(list);
      setPicked(Object.fromEntries(list.map((l) => [l.skill, true])));
      setLearnedState("done");
    } catch (err) {
      setLearnedError(err.message);
      setLearnedState("error");
    }
  }

  const pickedNames = learned.filter((l) => picked[l.skill]).map((l) => l.skill);

  async function runRewrite(force) {
    setStatus("loading");
    setErrorMsg("");
    setPageTab("review");
    setRecheck({ status: "idle", report: null, error: "" });

    const learnedArg = pickMode ? { planId: planId, skills: pickedNames } : null;
    const key = makeCacheKey(resumeText, matchingOutput, gaps, atsReport, learnedArg);
    if (!force) {
      const cached = readCache(key);
      if (cached) {
        setFresh(fromRewriteResult(cached, resumeText));
        setStatus("done");
        return;
      }
    }

    try {
      const data = await runResumeRewrite(resumeText, matchingOutput, gaps, atsReport, learnedArg);
      writeCache(key, data);
      setFresh(fromRewriteResult(data, resumeText));
      setSelected(null);
      setStatus("done");
      refreshVersions(); // the new version was saved by the backend, so list it
    } catch (err) {
      setErrorMsg(err.message);
      setStatus("error");
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

  // Learned-skills mode: read the learned skills from the saved plan when the page opens.
  useEffect(() => {
    if (!pickMode) return;
    let cancelled = false;
    getPlan(planId)
      .then((plan) => {
        if (cancelled) return;
        const list = plan?.progress?.learned_skills || [];
        setLearned(list);
        setPicked(Object.fromEntries(list.map((l) => [l.skill, true])));
        setLearnedState("done");
      })
      .catch((err) => {
        if (cancelled) return;
        setLearnedError(err.message);
        setLearnedState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [planId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasInputs) return; // no inputs: stay in the "idle" state
    if (pickMode) return; // learned-skills mode waits for the button
    if (hasStarted.current) return;
    hasStarted.current = true;
    runRewrite(false);
  }, [resumeText, matchingOutput, gaps, atsReport]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ATS-fix mode: score the rewritten resume with the same ATS Agent as before.
  async function handleRecheck() {
    setRecheck({ status: "loading", report: null, error: "" });
    try {
      const report = await runATSAnalysis(current.rewritten);
      setRecheck({ status: "done", report: report, error: "" });
    } catch (err) {
      setRecheck({ status: "error", report: null, error: err.message });
    }
  }

  const viewingOlder = Boolean(selected);
  const showLoading = status === "loading" && !selected;
  const showError = status === "error" && !selected;
  const showPicker = pickMode && status === "idle" && !selected;
  const showIdle = status === "idle" && !selected && !pickMode;
  const showResult = Boolean(current) && (current === selected || status === "done");
  const reviewCount = current ? current.warnings.length : 0;
  const noChanges = stats.added === 0 && stats.removed === 0;

  const scoreBefore = atsMode ? atsReport.score : null;
  const scoreAfter = recheck.status === "done" && recheck.report ? recheck.report.score : null;
  const scoreDelta = scoreAfter !== null && scoreBefore !== null ? scoreAfter - scoreBefore : null;

  return (
    <div className="shell">
      <Sidebar />
      <section className="route rw-page" style={{ padding: "2rem" }}>
        <div className="page-head">
          <div>
            <span className="kicker"></span>
            <h1>Resume rewrite</h1>
            <p>
              {atsMode
                ? "We fix the problems the ATS check found by rewording and tidying what you already wrote. We never add skills, employers or numbers you did not give us."
                : "We reword your resume to fit the job. We only rephrase what you already wrote, plus any skills you finished learning. We never add other skills, employers or numbers you did not give us."}
            </p>
          </div>
          {atsMode ? (
            <button className="btn secondary" onClick={() => navigate(-1)}>
              Back to ATS report
            </button>
          ) : (
            <Link to="/skill-gap" className="btn secondary">
              Back to skill gap plan
            </Link>
          )}
        </div>

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

            {showPicker && (
              <div className="panel">
                <h3>Skills to add to your resume</h3>
                <p className="desc">
                  These are the skills where you finished every step (Learn, Practice and Build). Untick any you do not
                  want on your resume. Each one is added to your Skills section with a short practice-project bullet. We
                  only use the project text shown here and never add experience, results or numbers you did not give us.
                </p>

                {learnedState === "loading" && <p className="desc">Loading your learned skills…</p>}

                {learnedState === "error" && (
                  <p style={{ color: "var(--gap)" }}>
                    {learnedError}{" "}
                    <button className="btn ghost" onClick={loadLearned}>
                      Retry
                    </button>
                  </p>
                )}

                {learnedState === "done" && learned.length === 0 && (
                  <p className="desc">
                    No finished skills found in your saved plan. Tick every step of a skill on the{" "}
                    <Link to="/skill-gap">Skill gap page</Link>, or rewrite without adding any.
                  </p>
                )}

                {learned.length > 0 && (
                  <div className="row-list">
                    {learned.map((l) => (
                      <label className="row-item" key={l.skill} style={{ cursor: "pointer", gap: ".8rem", justifyContent: "flex-start" }}>
                        <input
                          type="checkbox"
                          checked={Boolean(picked[l.skill])}
                          onChange={() => setPicked({ ...picked, [l.skill]: !picked[l.skill] })}
                        />
                        <div>
                          <div className="label">{l.skill}</div>
                          {l.project && <p className="desc">Practice project: {l.project}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                <div className="rw-actions">
                  <button className="btn" onClick={() => runRewrite(false)} disabled={learnedState === "loading"}>
                    {pickedNames.length > 0
                      ? `Rewrite with ${pickedNames.length} ${pickedNames.length === 1 ? "skill" : "skills"}`
                      : "Rewrite without adding skills"}
                  </button>
                </div>
              </div>
            )}

            {showIdle && (
              <div className="panel">
                <h3>Nothing to review yet</h3>
                <p className="desc">
                  A rewrite starts from the ATS report or the skill gap plan.{" "}
                  <Link to="/upload">Start a new analysis</Link>, or open one of your{" "}
                  <button className="rw-linkbtn" onClick={() => setPageTab("saved")}>
                    saved versions
                  </button>
                  .
                </p>
              </div>
            )}

            {showLoading && (
              <AnalysisLoader
                title="Rewriting your resume"
                messages={atsMode ? ATS_LOADER_MESSAGES : JOB_LOADER_MESSAGES}
                hint="This usually takes 10 to 30 seconds. Please keep this page open."
              />
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
                      <span className={"tag " + (reviewCount > 0 ? "active" : "match")}>
                        {reviewCount > 0 ? "Needs your input" : "Ready to use"}
                      </span>
                      <h3 className="rw-hero-title">
                        {viewingOlder ? "Version " + current.versionNo : "Your rewritten resume is ready"}
                      </h3>
                      <p className="desc">
                        {current.versionNo ? "Saved automatically as version " + current.versionNo : "Saved automatically"}
                        {current.createdAt ? " · " + formatDate(current.createdAt) : ""}
                      </p>
                      {describeScores(current.scores) && (
                        <p className="desc">
                          Scores after this rewrite: <strong>{describeScores(current.scores)}</strong>
                        </p>
                      )}
                      {reviewCount > 0 && (
                        <p className="desc rw-hero-note">
                          {reviewCount} {reviewCount === 1 ? "item needs" : "items need"} your input before you send
                          this resume. Details are in the box below.
                        </p>
                      )}
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
                        <span className={"rw-stat-value" + (reviewCount > 0 ? " rw-warn" : "")}>{reviewCount}</span>
                        <span className="rw-stat-label">{reviewCount === 1 ? "needs your input" : "need your input"}</span>
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

                {/* 2. things that need your input */}
                {current.warnings.length > 0 && (
                  <div className="panel rw-attention" style={{ marginTop: "1.2rem" }}>
                    <h3>
                      {current.warnings.length} {current.warnings.length === 1 ? "thing needs" : "things need"} your input
                    </h3>
                    <p className="desc">
                      We only reword what you already wrote, so we never make up details. For the items below, add the
                      real information yourself (such as numbers or links), or remove anything that is not true.
                    </p>
                    <div className="rw-todo-list">
                      {current.warnings.map((w, i) => {
                        const { label, body } = splitLabel(w);
                        const verify = /not found in your original/i.test(w);
                        return (
                          <div className="rw-todo" key={i}>
                            <span className="rw-todo-num">{i + 1}</span>
                            <div className="rw-todo-main">
                              <div className="rw-todo-head">
                                <span className="rw-todo-label">{label || "Please review"}</span>
                                <span className={"rw-todo-kind" + (verify ? " verify" : "")}>
                                  {verify ? "Check it is true" : "Add real details"}
                                </span>
                              </div>
                              <p className="rw-todo-text">{body}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. what changed */}
                <div className="panel" style={{ marginTop: "1.2rem" }}>
                  <h3>What we changed</h3>
                  <div className="row-list">
                    {current.diffSummary.length ? (
                      current.diffSummary.map((d, i) => {
                        const { label, body } = splitLabel(d);
                        return (
                          <div className="rw-change" key={i}>
                            {label && <span className="rw-change-label">{label}</span>}
                            <p className="rw-change-text">{body}</p>
                          </div>
                        );
                      })
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

                {/* 5a. next step in ATS-fix mode: check the ATS score again */}
                {atsMode && !viewingOlder && (
                  <div className="panel" style={{ marginTop: "1.2rem" }}>
                    <h3>Check your ATS score again?</h3>
                    <p className="desc">
                      Your original resume scored <strong>{scoreBefore}/100</strong>. Run the ATS check on this rewrite to
                      see whether the score improved.
                    </p>

                    {recheck.status === "done" && recheck.report && (
                      <div style={{ margin: ".8rem 0" }}>
                        <p>
                          <strong>
                            {scoreBefore} → {scoreAfter}
                          </strong>{" "}
                          <span className={"tag " + (scoreDelta > 0 ? "match" : scoreDelta < 0 ? "gap" : "active")}>
                            {scoreDelta > 0 ? "+" + scoreDelta + " improved" : scoreDelta < 0 ? scoreDelta + " lower" : "no change"}
                          </span>
                        </p>
                        {recheck.report.issues.length === 0 ? (
                          <p className="desc">No ATS issues found in the rewritten resume.</p>
                        ) : (
                          <>
                            <p className="desc">Still flagged ({recheck.report.issues.length}):</p>
                            <div className="row-list">
                              {recheck.report.issues.map((issue, i) => (
                                <div className="row-item" key={i}>
                                  <div>
                                    <div className="label">{issue.category}</div>
                                    <p className="desc">{issue.message}</p>
                                  </div>
                                  <span className={"tag " + (issue.severity === "high" ? "gap" : issue.severity === "low" ? "match" : "active")}>
                                    {issue.severity}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {recheck.status === "error" && <p style={{ color: "var(--gap)" }}>{recheck.error}</p>}

                    <div className="rw-actions">
                      <button className="btn" onClick={handleRecheck} disabled={recheck.status === "loading"}>
                        {recheck.status === "loading" ? "Checking…" : recheck.status === "done" ? "Check again" : "Check ATS score again"}
                      </button>
                      <button className="btn ghost" onClick={() => runRewrite(true)} disabled={status === "loading"}>
                        Make a different rewrite
                      </button>
                    </div>
                    <p className="desc rw-small">
                      &ldquo;Make a different rewrite&rdquo; runs the rewrite again and saves the result as a new version.
                    </p>
                  </div>
                )}

                {/* 5b. job mode: ask for a different rewrite */}
                {hasInputs && !atsMode && (
                  <div className="panel" style={{ marginTop: "1.2rem" }}>
                    <h3>Not happy with this rewrite?</h3>
                    <p className="desc">
                      Run the rewrite again for different wording. It is saved as a new version, and your earlier versions
                      stay in Saved versions.
                    </p>
                    <div className="rw-actions">
                      <button className="btn" onClick={() => runRewrite(true)} disabled={status === "loading"}>
                        Make a different rewrite
                      </button>
                    </div>
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
                          {index === 0 && <span className="tag rw-latest">Latest</span>}
                          {v.source === "ats_fix" && <span className="tag">ATS fix</span>}
                          {v.warning_count > 0 && (
                            <span className="tag active">
                              {v.warning_count} {v.warning_count === 1 ? "item needs" : "items need"} your input
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