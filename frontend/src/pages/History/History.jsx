import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";
import TrendChart from "../../components/TrendChart";
import { listAnalyses } from "../../api/historyApi";
import { listResumeVersions } from "../../api/rewriteApi";
import { useSkillPlans, planForAnalysis, learnedCount } from "../../utils/skillPlanStats";
import { buildTimeline, latestRewriteFor } from "../../utils/scoreTimeline";
import {
  byDateAsc,
  byDateDesc,
  formatDate,
  formatDelta,
  jobKey,
  jobLabel,
  scoreChange,
} from "../../utils/historyStats";
import "../MatchReport/MatchReport.css"; // same page width as the other pages
import "./History.css";

// Route: /history   (compare pages open from here: /compare?type=analysis|version&a=ID&b=ID)

/* ---------- loading helper ---------- */

function useResource(loader) {
  const [state, setState] = useState({ status: "loading", data: null, error: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loader()
      .then((data) => {
        if (!cancelled) setState({ status: "done", data: data, error: "" });
      })
      .catch((err) => {
        if (!cancelled) setState({ status: "error", data: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  function reload() {
    setState({ status: "loading", data: null, error: "" });
    setAttempt((n) => n + 1);
  }

  return [state, reload];
}

/* ---------- small pieces ---------- */

function Chips({ items, tone }) {
  if (!items.length) return <span className="hx-muted">None</span>;
  const out = [];
  for (let i = 0; i < items.length; i++) {
    out.push(
      <span className={"tag " + tone} key={i}>
        {items[i]}
      </span>
    );
  }
  return <div className="hx-chips">{out}</div>;
}

function Delta({ change }) {
  if (!change || change.tone === "flat") return null;
  return (
    <span className={"hx-delta hx-delta-" + change.tone} title="Change since the previous analysis of this job">
      {change.tone === "up" ? "▲ " : "▼ "}
      {Math.abs(change.delta)}
    </span>
  );
}

function SelectBar({ count, noun, onCompare, onClear }) {
  if (count === 0) {
    return <p className="hx-hint">Tick two {noun} to compare them side by side.</p>;
  }
  return (
    <div className="hx-selectbar">
      <span>
        {count === 1 ? "1 selected. Pick one more to compare." : "2 selected."}
      </span>
      <div className="hx-actions">
        <button className="btn" onClick={onCompare} disabled={count !== 2}>
          Compare
        </button>
        <button className="btn ghost" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}

function Empty({ title, children }) {
  return (
    <div className="hx-empty">
      <h4>{title}</h4>
      <p className="desc">{children}</p>
    </div>
  );
}

/* ---------- analyses tab ---------- */

function AnalysesTab({ items, versions, plans, selected, onToggle, onCompare, onClear }) {
  const [jobChoice, setJobChoice] = useState(null); // null = not chosen yet, so show your latest job
  const [open, setOpen] = useState({});

  const jobs = useMemo(() => {
    const seen = new Map();
    for (let i = 0; i < items.length; i++) {
      const key = jobKey(items[i]);
      if (!key) continue;
      if (!seen.has(key)) seen.set(key, { key: key, label: jobLabel(items[i]), count: 0 });
      seen.get(key).count++;
    }
    return Array.from(seen.values());
  }, [items]);

  // The chart opens on your most recent job so it is never a mix of unrelated jobs.
  const latestJobKey = useMemo(() => {
    const newest = byDateDesc(items);
    for (let i = 0; i < newest.length; i++) {
      const key = jobKey(newest[i]);
      if (key) return key;
    }
    return "all";
  }, [items]);
  const jobFilter =
    jobChoice !== null && (jobChoice === "all" || jobs.some((j) => j.key === jobChoice)) ? jobChoice : latestJobKey;

  const visible = useMemo(() => {
    return items.filter((a) => jobFilter === "all" || jobKey(a) === jobFilter);
  }, [items, jobFilter]);

  // chart data (oldest first) and the change since the previous run of the same job
  const ascending = useMemo(() => byDateAsc(visible), [visible]);
  const sinceLast = useMemo(() => {
    const last = new Map();
    const out = new Map();
    for (let i = 0; i < ascending.length; i++) {
      const a = ascending[i];
      const key = jobKey(a);
      if (key && last.has(key)) out.set(a.id, scoreChange(last.get(key), a.match_score));
      if (key && typeof a.match_score === "number") last.set(key, a.match_score);
    }
    return out;
  }, [ascending]);

  // analyses plus the scores taken after each resume rewrite
  const timeline = useMemo(() => buildTimeline(items, versions, jobFilter), [items, versions, jobFilter]);
  const matchPoints = timeline.matchValues.filter((v) => v !== null);
  const trend = matchPoints.length >= 2 ? scoreChange(matchPoints[0], matchPoints[matchPoints.length - 1]) : null;
  const mixedJobs = jobFilter === "all" && jobs.length > 1;
  const jobName = jobs.find((j) => j.key === jobFilter)?.label || "";
  const learnedNow = visible.reduce((best, a) => Math.max(best, learnedCount(planForAnalysis(plans, a.id))), 0);

  if (items.length === 0) {
    return (
      <Empty title="No analyses yet">
        Every time you match your resume, the result is saved here so you can track your progress.{" "}
        <Link to="/upload">Start a new analysis</Link>.
      </Empty>
    );
  }

  const cards = [];
  const list = byDateDesc(visible);
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const isSelected = selected.includes(a.id);
    const isOpen = Boolean(open[a.id]);
    const matched = a.matched_skills || [];
    const missing = a.missing_skills || [];
    const plan = planForAnalysis(plans, a.id);
    const learned = plan?.progress?.learned_skills || [];
    const rewrite = latestRewriteFor(versions, a.id);
    const rs = rewrite ? rewrite.scores : null;

    cards.push(
      <div className={"hx-card" + (isSelected ? " hx-card-selected" : "")} key={a.id}>
        <label className="hx-check">
          <input type="checkbox" checked={isSelected} onChange={() => onToggle(a.id)} aria-label={"Select " + jobLabel(a) + " from " + formatDate(a.created_at)} />
        </label>
        <div className="hx-card-main">
          <div className="hx-card-head">
            <span className="hx-card-title">{jobLabel(a)}</span>
            <span className="tag">{a.flow === "resume_only" ? "Resume only" : "Resume + job"}</span>
          </div>
          <div className="hx-card-meta">
            <span>{formatDate(a.created_at)}</span>
            {typeof a.ats_score === "number" && <span>ATS <strong>{a.ats_score}</strong></span>}
            {typeof a.match_score === "number" && (
              <span>
                Match <strong>{a.match_score}</strong> <Delta change={sinceLast.get(a.id)} />
              </span>
            )}
            {a.flow !== "resume_only" && (
              <span>
                {matched.length} matched · {missing.length} missing
              </span>
            )}
            {plan && (
              <span className="tag" title="Share of your learning-plan steps you have ticked">
                Learning {plan.progress.pct}% · {learned.length} {learned.length === 1 ? "skill" : "skills"} learned
              </span>
            )}
          </div>
          {rs && (
            <p className="hx-reason">
              After your latest rewrite:{" "}
              {typeof rs.ats_after === "number" && (
                <>
                  ATS <strong>{typeof rs.ats_before === "number" ? rs.ats_before + " → " : ""}{rs.ats_after}</strong>
                </>
              )}
              {typeof rs.match_after === "number" && (
                <>
                  {" · "}Match <strong>{typeof rs.match_before === "number" ? rs.match_before + " → " : ""}{rs.match_after}</strong>
                </>
              )}
              {rewrite.learned_skill_count > 0 &&
                " · " + rewrite.learned_skill_count + " learned " + (rewrite.learned_skill_count === 1 ? "skill" : "skills") + " added"}
            </p>
          )}
          {a.flow !== "resume_only" && (
            <>
              <button className="hx-linkbtn" onClick={() => setOpen({ ...open, [a.id]: !isOpen })} aria-expanded={isOpen}>
                {isOpen ? "Hide skills" : "Show skills"}
              </button>
              {isOpen && (
                <div className="hx-skills">
                  <p className="hx-label">Matched</p>
                  <Chips items={matched} tone="match" />
                  <p className="hx-label">Missing</p>
                  <Chips items={missing} tone="gap" />
                  {learned.length > 0 && (
                    <>
                      <p className="hx-label">Learned from your plan</p>
                      <Chips items={learned.map((l) => l.skill)} tone="match" />
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="panel">
        <div className="hx-panel-head">
          <h3>{jobFilter === "all" ? "Score over time" : "How your scores changed for this job"}</h3>
          {jobs.length > 1 && (
            <label className="hx-filter">
              Show
              <select value={jobFilter} onChange={(e) => setJobChoice(e.target.value)}>
                <option value="all">All jobs ({items.length})</option>
                {jobs.map((j) => (
                  <option value={j.key} key={j.key}>
                    {j.label} ({j.count})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {trend ? (
          <p className="desc">
            {jobName ? "Match for " + jobName + ": " : "Match score "}
            {trend.from} → {trend.to} (<strong>{formatDelta(trend.delta)}</strong>) across {timeline.analysisCount}{" "}
            {timeline.analysisCount === 1 ? "analysis" : "analyses"}
            {timeline.rewriteCount > 0 &&
              " and " + timeline.rewriteCount + (timeline.rewriteCount === 1 ? " rewrite" : " rewrites")}
            {learnedNow > 0 && ", with " + learnedNow + " " + (learnedNow === 1 ? "skill" : "skills") + " learned"}.
          </p>
        ) : (
          <p className="desc">Run another analysis, or rewrite your resume, to see how your scores change.</p>
        )}
        {mixedJobs && (
          <p className="hx-note">
            This chart mixes different jobs, so ups and downs can come from the job and not only your resume. Pick one job
            above for a fair trend.
          </p>
        )}

        <TrendChart
          labels={timeline.labels}
          subLabels={timeline.subLabels}
          pointKinds={timeline.kinds}
          ariaLabel="Match score and ATS score over time"
          series={[
            { name: "Match score", color: "var(--match)", values: timeline.matchValues },
            { name: "ATS score", color: "var(--gold)", values: timeline.atsValues },
          ]}
        />
        {timeline.rewriteCount > 0 && (
          <p className="hx-note">
            Every rewrite starts again from your original resume, not from the previous rewrite, and match scores come
            from an AI check. So two rewrites can score differently, and the line can dip. Look at the latest and best
            scores rather than every dip.
          </p>
        )}
      </div>

      <div className="panel" style={{ marginTop: "1.2rem" }}>
        <h3>Your analyses</h3>
        <SelectBar count={selected.length} noun="analyses" onCompare={onCompare} onClear={onClear} />
        <div className="hx-list">{cards}</div>
      </div>
    </>
  );
}

/* ---------- versions tab ---------- */

function VersionsTab({ items, selected, onToggle, onCompare, onClear }) {
  if (items.length === 0) {
    return (
      <Empty title="No saved resume versions yet">
        Each rewrite is saved automatically. <Link to="/upload">Start a new analysis</Link> to create your first one.
      </Empty>
    );
  }

  const cards = [];
  for (let i = 0; i < items.length; i++) {
    const v = items[i];
    const isSelected = selected.includes(v.id);
    cards.push(
      <div className={"hx-card" + (isSelected ? " hx-card-selected" : "")} key={v.id}>
        <label className="hx-check">
          <input type="checkbox" checked={isSelected} onChange={() => onToggle(v.id)} aria-label={"Select version " + v.version_no} />
        </label>
        <div className="hx-card-main">
          <div className="hx-card-head">
            <span className="hx-card-title">Version {v.version_no}</span>
            {i === 0 && <span className="tag active">Latest</span>}
            {v.learned_skill_count > 0 && (
              <span className="tag match">
                {v.learned_skill_count} learned {v.learned_skill_count === 1 ? "skill" : "skills"} added
              </span>
            )}
            {v.warning_count > 0 && <span className="tag gap">{v.warning_count} to check</span>}
          </div>
          <div className="hx-card-meta">
            <span>{formatDate(v.created_at)}</span>
            {v.change_count > 0 && <span>{v.change_count} changes listed</span>}
            {v.scores && typeof v.scores.ats_after === "number" && (
              <span>
                ATS <strong>{typeof v.scores.ats_before === "number" ? v.scores.ats_before + " → " : ""}{v.scores.ats_after}</strong>
              </span>
            )}
            {v.scores && typeof v.scores.match_after === "number" && (
              <span>
                Match <strong>{typeof v.scores.match_before === "number" ? v.scores.match_before + " → " : ""}{v.scores.match_after}</strong>
              </span>
            )}
          </div>
          <p className="hx-reason">{v.summary || "Rewritten resume"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <h3>Your resume versions</h3>
      <p className="desc">
        Compare any two saved rewrites to see exactly which words changed. To download one, open it in{" "}
        <Link to="/resume-rewrite">Resume rewrite</Link>.
      </p>
      <SelectBar count={selected.length} noun="versions" onCompare={onCompare} onClear={onClear} />
      <div className="hx-list">{cards}</div>
    </div>
  );
}

/* ---------- page ---------- */

const TABS = [
  { id: "analyses", label: "Analyses", type: "analysis" },
  { id: "versions", label: "Resume versions", type: "version" },
];

export default function History() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("analyses");
  const [analyses, reloadAnalyses] = useResource(listAnalyses);
  const [versions, reloadVersions] = useResource(listResumeVersions);
  const skillPlans = useSkillPlans(); // learning progress per analysis; the page works without it
  const [selected, setSelected] = useState({ analyses: [], versions: [] });

  function toggle(kind, id) {
    setSelected((prev) => {
      const current = prev[kind];
      const next = current.includes(id) ? current.filter((x) => x !== id) : current.concat([id]).slice(-2);
      return { ...prev, [kind]: next };
    });
  }

  function clear(kind) {
    setSelected((prev) => ({ ...prev, [kind]: [] }));
  }

  function compare(kind, type) {
    const ids = selected[kind];
    if (ids.length !== 2) return;
    navigate("/compare?type=" + type + "&a=" + encodeURIComponent(ids[0]) + "&b=" + encodeURIComponent(ids[1]));
  }

  const sources = { analyses: analyses, versions: versions };
  const reloaders = { analyses: reloadAnalyses, versions: reloadVersions };
  const counts = {
    analyses: analyses.status === "done" ? analyses.data.items.length : null,
    versions: versions.status === "done" ? versions.data.length : null,
  };
  const usingSample = analyses.status === "done" && analyses.data.isSample;

  const active = sources[tab];
  const activeTab = TABS.find((t) => t.id === tab);

  let body;
  if (active.status === "loading") {
    body = (
      <div className="panel">
        <p className="desc">Loading…</p>
      </div>
    );
  } else if (active.status === "error") {
    body = (
      <div className="panel">
        <h3>Could not load this list</h3>
        <p style={{ color: "var(--gap)" }}>{active.error}</p>
        <button className="btn secondary" onClick={reloaders[tab]}>
          Try again
        </button>
      </div>
    );
  } else if (tab === "analyses") {
    body = (
      <AnalysesTab
        items={analyses.data.items}
        versions={versions.status === "done" ? versions.data : []}
        plans={skillPlans.plans}
        selected={selected.analyses}
        onToggle={(id) => toggle("analyses", id)}
        onCompare={() => compare("analyses", "analysis")}
        onClear={() => clear("analyses")}
      />
    );
  } else {
    body = (
      <VersionsTab
        items={versions.data}
        selected={selected.versions}
        onToggle={(id) => toggle("versions", id)}
        onCompare={() => compare("versions", "version")}
        onClear={() => clear("versions")}
      />
    );
  }

  return (
    <div className="shell">
      <Sidebar />
      <section className="route hx-page" style={{ padding: "2rem" }}>
        <div className="page-head">
          <div>
            <span className="kicker"></span>
            <h1>History</h1>
            <p>
              Everything you have analysed and rewritten, and how your scores have changed. Pick any two items
              to compare them.
            </p>
          </div>
          <Link to="/upload" className="btn secondary">
            New analysis
          </Link>
        </div>

        {usingSample && (
          <div className="hx-sample" role="status">
            <strong>Showing sample data.</strong> The history service is not available on your backend yet, so the
            analyses below are examples. Your resume versions are real.
          </div>
        )}

        <div className="hx-pagetabs" role="tablist" aria-label="History sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={"hx-pagetab" + (tab === t.id ? " active" : "")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {counts[t.id] !== null ? " (" + counts[t.id] + ")" : ""}
            </button>
          ))}
        </div>

        <p className="hx-tabhelp">
          {activeTab.id === "analyses" && "Each time you matched your resume to a job. Track how your ATS and match scores move."}
          {activeTab.id === "versions" && "Every rewritten resume that was saved."}
        </p>

        {body}

        <footer className="note">SkillGap AI</footer>
      </section>
    </div>
  );
}