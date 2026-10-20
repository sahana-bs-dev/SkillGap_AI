import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";
import { listAnalyses } from "../../api/historyApi";
import { getResumeVersion, listResumeVersions } from "../../api/rewriteApi";
import { buildSegments, diffStats, diffText } from "../../utils/textDiff";
import { plainForDiff } from "../../utils/resumeFormat";
import { latestRewriteFor } from "../../utils/scoreTimeline";
import {
  byDateAsc,
  compareSkills,
  describeAnalysisChange,
  formatDate,
  formatDelta,
  jdRelation,
  jobLabel,
  scoreChange,
} from "../../utils/historyStats";
import "../MatchReport/MatchReport.css"; // same page width as the other pages
import "../History/History.css"; // shared History/Compare styles
import "./Compare.css";

// Route: /compare?type=analysis|version&a=ID&b=ID
// The older item is always shown as "Earlier" and the newer one as "Later",
// whichever order they were picked in.

const TYPES = {
  analysis: "analyses",
  version: "resume versions",
};

async function loadComparison(type, a, b) {
  if (type === "version") {
    const pair = await Promise.all([getResumeVersion(a), getResumeVersion(b)]);
    return { items: byDateAsc(pair), isSample: false };
  }

  const res = await listAnalyses();
  const first = res.items.find((x) => x.id === a);
  const second = res.items.find((x) => x.id === b);
  if (!first || !second) {
    throw new Error("One of these items could not be found. It may have been deleted.");
  }
  // Scores taken after a resume rewrite live on the saved versions. If they cannot be loaded, compare without them.
  let versions = [];
  try {
    versions = await listResumeVersions();
  } catch (err) {
    console.error("Could not load resume versions for the comparison:", err);
  }
  return { items: byDateAsc([first, second]), isSample: res.isSample, versions: versions };
}

/* ---------- small pieces ---------- */

function DeltaPill({ change }) {
  if (!change) return <span className="hx-muted">not available</span>;
  if (change.tone === "flat") return <span className="hx-delta hx-delta-flat">no change</span>;
  return (
    <span className={"hx-delta hx-delta-" + change.tone}>
      {change.tone === "up" ? "▲ " : "▼ "}
      {formatDelta(change.delta)}
    </span>
  );
}

function SkillGroup({ title, help, items, tone }) {
  if (!items.length) return null;
  return (
    <div className="cx-group">
      <h4>
        {title} <span className="hx-muted">({items.length})</span>
      </h4>
      <p className="hx-muted">{help}</p>
      <div className="hx-chips">
        {items.map((s) => (
          <span className={"tag " + tone} key={s}>
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

function SegmentText({ segments }) {
  const nodes = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const prev = i > 0 ? segments[i - 1] : null;
    const needSpace = prev && !prev.text.endsWith("\n") && !seg.text.startsWith("\n");
    nodes.push(
      <Fragment key={i}>
        {needSpace ? " " : ""}
        <span className={"hx-" + seg.type}>{seg.text}</span>
      </Fragment>
    );
  }
  return <pre className="cx-text">{nodes}</pre>;
}

/* ---------- compare: analyses ---------- */

function AnalysisCompare({ earlier, later, versions }) {
  const relation = jdRelation(earlier, later);
  const match = scoreChange(earlier.match_score, later.match_score);
  const ats = scoreChange(earlier.ats_score, later.ats_score);
  const skills = compareSkills(earlier, later);
  const hasSkills = [earlier, later].every((x) => (x.matched_skills || []).length + (x.missing_skills || []).length > 0);

  const rows = [
    { label: "Match score", change: match, from: earlier.match_score, to: later.match_score },
    { label: "ATS score", change: ats, from: earlier.ats_score, to: later.ats_score },
  ];

  // The scores above come from the two analyses themselves. Rewriting your resume gives new scores,
  // saved on the resume version, so they are compared separately here.
  const earlierRewrite = latestRewriteFor(versions, earlier.id);
  const laterRewrite = latestRewriteFor(versions, later.id);
  const eS = earlierRewrite ? earlierRewrite.scores : null;
  const lS = laterRewrite ? laterRewrite.scores : null;
  const pick = (s, key) => (s && typeof s[key] === "number" ? s[key] : null);
  // A side that was never rewritten still has its own analysis score, so it is the fair starting point.
  const side = (s, analysis, afterKey, ownKey) => (pick(s, afterKey) !== null ? pick(s, afterKey) : pick(analysis, ownKey));
  const afterRows = [
    { label: "Match score", from: side(eS, earlier, "match_after", "match_score"), to: side(lS, later, "match_after", "match_score") },
    { label: "ATS score", from: side(eS, earlier, "ats_after", "ats_score"), to: side(lS, later, "ats_after", "ats_score") },
  ].map((r) => ({ ...r, change: scoreChange(r.from, r.to) }));

  return (
    <>
      {relation === "different" && (
        <div className="cx-warn" role="note">
          <strong>These two analyses are for different jobs.</strong> “{jobLabel(earlier)}” and “{jobLabel(later)}” ask for
          different skills, so a change in score can come from the job and not only from changes to your resume. For a
          fair comparison, compare two analyses of the same job.
        </div>
      )}
      {relation === "same" && (
        <div className="cx-info" role="note">
          Same job both times, so any difference comes from changes to your resume.
        </div>
      )}

      <div className="panel">
        <h3>What changed</h3>
        <p className="cx-summary">{describeAnalysisChange(match, skills, relation)}</p>
      </div>

      <div className="panel" style={{ marginTop: "1.2rem" }}>
        <h3>Scores</h3>
        <div className="cx-pair">
          {[earlier, later].map((a, i) => (
            <div className="cx-side" key={a.id}>
              <span className="cx-side-tag">{i === 0 ? "Earlier" : "Later"}</span>
              <strong>{jobLabel(a)}</strong>
              <span className="hx-muted">{formatDate(a.created_at)}</span>
            </div>
          ))}
        </div>
        <div className="cx-rows">
          {rows.map((r) => (
            <div className="cx-row" key={r.label}>
              <span className="cx-row-label">{r.label}</span>
              <span className="cx-row-values">
                {typeof r.from === "number" ? r.from : "–"} → {typeof r.to === "number" ? r.to : "–"}
              </span>
              <DeltaPill change={r.change} />
            </div>
          ))}
        </div>
      </div>

      {(eS || lS) && (
        <div className="panel" style={{ marginTop: "1.2rem" }}>
          <h3>After rewriting your resume</h3>
          <p className="desc">
            The scores above come from each analysis itself. These are the scores of the newest rewrite made from each
            analysis, so they show what your resume scored after you added skills and rewrote it. If one analysis was
            never rewritten, its own score is used instead.
          </p>
          <div className="cx-pair">
            {[
              { a: earlier, s: eS, v: earlierRewrite, tag: "Earlier" },
              { a: later, s: lS, v: laterRewrite, tag: "Later" },
            ].map((x) => (
              <div className="cx-side" key={x.a.id}>
                <span className="cx-side-tag">{x.tag}</span>
                <strong>{x.s ? "Version " + x.v.version_no : "No rewrite yet"}</strong>
                <span className="hx-muted">
                  {x.s
                    ? formatDate(x.v.created_at) +
                      (x.v.learned_skill_count > 0
                        ? " · " + x.v.learned_skill_count + " learned " + (x.v.learned_skill_count === 1 ? "skill" : "skills") + " added"
                        : "")
                    : "Never rewritten, so its own scores are used"}
                </span>
              </div>
            ))}
          </div>
          <div className="cx-rows">
            {afterRows.map((r) => (
              <div className="cx-row" key={r.label}>
                <span className="cx-row-label">{r.label}</span>
                <span className="cx-row-values">
                  {typeof r.from === "number" ? r.from : "–"} → {typeof r.to === "number" ? r.to : "–"}
                </span>
                <DeltaPill change={r.change} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel" style={{ marginTop: "1.2rem" }}>
        <h3>Skills</h3>
        {!hasSkills ? (
          <p className="desc">One of these analyses has no job attached, so there are no skills to compare.</p>
        ) : (
          <>
            <SkillGroup title="Gained" help="Missing before, matched now." items={skills.gained} tone="match" />
            <SkillGroup title="Lost" help="Matched before, missing now." items={skills.lost} tone="gap" />
            <SkillGroup title="Still missing" help="Missing both times." items={skills.stillMissing} tone="gap" />
            <SkillGroup title="Still matched" help="Matched both times." items={skills.stillMatched} tone="match" />
            <SkillGroup title="Only in the earlier job" help="The later job did not ask for these." items={skills.onlyEarlier} tone="" />
            <SkillGroup title="Only in the later job" help="The earlier job did not ask for these." items={skills.onlyLater} tone="" />
          </>
        )}
      </div>
    </>
  );
}

/* ---------- compare: resume versions ---------- */

function VersionCompare({ earlier, later }) {
  const [mode, setMode] = useState("side");
  const ops = useMemo(
    () => diffText(plainForDiff(earlier.rewritten_text), plainForDiff(later.rewritten_text)),
    [earlier, later]
  );
  const stats = diffStats(ops);
  const parts = useMemo(
    () => ({ inline: buildSegments(ops, "inline"), left: buildSegments(ops, "left"), right: buildSegments(ops, "right") }),
    [ops]
  );
  const identical = stats.added === 0 && stats.removed === 0;

  return (
    <>
      <div className="panel">
        <h3>What changed</h3>
        <p className="cx-summary">
          {identical
            ? "Version " + earlier.version_no + " and version " + later.version_no + " have the same text."
            : "From version " + earlier.version_no + " to version " + later.version_no + ", " + stats.added + " words were added and " + stats.removed + " were removed."}
        </p>
        <div className="cx-pair">
          {[earlier, later].map((v, i) => (
            <div className="cx-side" key={v.id}>
              <span className="cx-side-tag">{i === 0 ? "Earlier" : "Later"}</span>
              <strong>Version {v.version_no}</strong>
              <span className="hx-muted">
                {formatDate(v.created_at)} · {(v.warnings || []).length} to check
              </span>
            </div>
          ))}
        </div>
        <p className="hx-muted" style={{ marginTop: ".8rem" }}>
          This compares the two rewritten resumes with each other (not with your original).
        </p>
      </div>

      <div className="panel" style={{ marginTop: "1.2rem" }}>
        <h3>The two versions</h3>
        <div className="cx-tabs" role="tablist" aria-label="Comparison view">
          <button className={"cx-tab" + (mode === "side" ? " active" : "")} onClick={() => setMode("side")}>
            Side by side
          </button>
          <button className={"cx-tab" + (mode === "inline" ? " active" : "")} onClick={() => setMode("inline")}>
            Highlighted changes
          </button>
        </div>
        <p className="hx-muted" style={{ margin: ".6rem 0 .8rem" }}>
          {mode === "side"
            ? "Left is the earlier version, right is the later one. Red words were removed and green words were added."
            : "One copy of the later version. Red struck-through words were removed and green words were added."}
        </p>

        {mode === "inline" ? (
          <div className="cx-pane">
            <SegmentText segments={parts.inline} />
          </div>
        ) : (
          <div className="cx-columns">
            <div className="cx-pane">
              <h4 className="cx-pane-title">Version {earlier.version_no} (earlier)</h4>
              <SegmentText segments={parts.left} />
            </div>
            <div className="cx-pane">
              <h4 className="cx-pane-title">Version {later.version_no} (later)</h4>
              <SegmentText segments={parts.right} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ---------- page ---------- */

function CompareBody({ type, a, b }) {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });

  useEffect(() => {
    let cancelled = false;
    loadComparison(type, a, b)
      .then((data) => {
        if (!cancelled) setState({ status: "done", data: data, error: "" });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", data: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [type, a, b]);

  const titles = { analysis: "Compare analyses", version: "Compare resume versions" };

  let body;
  if (state.status === "loading") {
    body = (
      <div className="panel">
        <p className="desc">Loading the comparison…</p>
      </div>
    );
  } else if (state.status === "error") {
    body = (
      <div className="panel">
        <h3>Could not load this comparison</h3>
        <p style={{ color: "var(--gap)" }}>{state.error}</p>
        <Link to="/history" className="btn secondary">
          Back to history
        </Link>
      </div>
    );
  } else {
    const [earlier, later] = state.data.items;
    body = (
      <>
        {state.data.isSample && (
          <div className="hx-sample" role="status">
            <strong>Showing sample data.</strong> The history service is not available on your backend yet.
          </div>
        )}
        {type === "analysis" && <AnalysisCompare earlier={earlier} later={later} versions={state.data.versions || []} />}
        {type === "version" && <VersionCompare earlier={earlier} later={later} />}

        <div className="callout" style={{ marginTop: "1.2rem" }}>
          <p>
            Want to try a new analysis? <Link to="/upload">Start a new analysis</Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <div className="shell">
      <Sidebar />
      <section className="route hx-page" style={{ padding: "2rem" }}>
        <div className="page-head">
          <div>
            <span className="kicker"></span>
            <h1>{titles[type]}</h1>
            <p>The older one is always shown first as “Earlier”, so changes read from left to right.</p>
          </div>
          <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
            <Link to="/upload" className="btn">
              Try a new analysis
            </Link>
            <Link to="/history" className="btn secondary">
              Back to history
            </Link>
          </div>
        </div>
        {body}
        <footer className="note">SkillGap AI</footer>
      </section>
    </div>
  );
}

export default function Compare() {
  const [params] = useSearchParams();
  const type = params.get("type");
  const a = params.get("a");
  const b = params.get("b");
  const valid = Boolean(TYPES[type]) && a && b && a !== b;

  if (!valid) {
    return (
      <div className="shell">
        <Sidebar />
        <section className="route hx-page" style={{ padding: "2rem" }}>
          <div className="page-head">
            <div>
              <span className="kicker"></span>
              <h1>Compare</h1>
            </div>
          </div>
          <div className="panel">
            <h3>Nothing to compare yet</h3>
            <p className="desc">
              Open the History page, tick two items of the same kind (two analyses or two resume versions) and
              press Compare.
            </p>
            <Link to="/history" className="btn">
              Go to history
            </Link>
          </div>
        </section>
      </div>
    );
  }

  // the key restarts the page cleanly when a different pair is opened
  return <CompareBody key={type + "|" + a + "|" + b} type={type} a={a} b={b} />;
}