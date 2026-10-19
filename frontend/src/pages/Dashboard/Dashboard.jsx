import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";
import TrendChart from "../../components/TrendChart";
import { useAuth } from "../../context/AuthContext";
import { listAnalyses, listLoops } from "../../api/historyApi";
import {
  byDateAsc,
  byDateDesc,
  formatDate,
  formatDay,
  formatDelta,
  jobKey,
  jobLabel,
  loopSummary,
  scoreChange,
} from "../../utils/historyStats";
import "../MatchReport/MatchReport.css"; // same page width as the other pages
import "../History/History.css"; // shared chips, deltas and notes
import "./Dashboard.css";

const CHART_POINTS = 10; // how many of the latest analyses the chart shows
const RECENT_COUNT = 3; // how many recent analyses are listed

/* ---------- loading helper (same idea as the History page) ---------- */

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

/* ---------- numbers shown on the page ---------- */

function buildStats(items) {
  const desc = byDateDesc(items);

  // newest analysis that has an ATS score, and newest that has a match score
  let atsIndex = -1;
  let matchIndex = -1;
  for (let i = 0; i < desc.length; i++) {
    if (atsIndex === -1 && typeof desc[i].ats_score === "number") atsIndex = i;
    if (matchIndex === -1 && typeof desc[i].match_score === "number") matchIndex = i;
  }

  const latestAts = atsIndex === -1 ? null : desc[atsIndex];
  const latestMatch = matchIndex === -1 ? null : desc[matchIndex];

  // ATS does not depend on a job: compare with the previous ATS score
  let atsChange = null;
  if (latestAts) {
    for (let i = atsIndex + 1; i < desc.length; i++) {
      if (typeof desc[i].ats_score === "number") {
        atsChange = scoreChange(desc[i].ats_score, latestAts.ats_score);
        break;
      }
    }
  }

  // Match score depends on the job: only compare with the previous run of the same job
  let matchChange = null;
  if (latestMatch && jobKey(latestMatch)) {
    for (let i = matchIndex + 1; i < desc.length; i++) {
      if (jobKey(desc[i]) === jobKey(latestMatch) && typeof desc[i].match_score === "number") {
        matchChange = scoreChange(desc[i].match_score, latestMatch.match_score);
        break;
      }
    }
  }

  // chart: the latest few analyses, oldest first
  const ascending = byDateAsc(items);
  const chartItems = ascending.slice(Math.max(0, ascending.length - CHART_POINTS));
  const labels = [];
  const matchValues = [];
  const atsValues = [];
  const jobs = {};
  let jobCount = 0;
  for (let i = 0; i < chartItems.length; i++) {
    const a = chartItems[i];
    labels.push(formatDay(a.created_at));
    matchValues.push(typeof a.match_score === "number" ? a.match_score : null);
    atsValues.push(typeof a.ats_score === "number" ? a.ats_score : null);
    const key = jobKey(a);
    if (key && typeof a.match_score === "number" && !jobs[key]) {
      jobs[key] = true;
      jobCount++;
    }
  }

  return {
    total: items.length,
    latestAts: latestAts,
    latestMatch: latestMatch,
    atsChange: atsChange,
    matchChange: matchChange,
    recent: desc.slice(0, RECENT_COUNT),
    labels: labels,
    matchValues: matchValues,
    atsValues: atsValues,
    mixedJobs: jobCount > 1,
  };
}

function bestLoopGain(loops) {
  let best = null;
  for (let i = 0; i < loops.length; i++) {
    const change = loopSummary(loops[i]).change;
    if (change && (best === null || change.delta > best)) best = change.delta;
  }
  return best;
}

/* ---------- small pieces ---------- */

function Change({ change }) {
  if (!change) return null;
  if (change.tone === "flat") return <span className="hx-muted">no change</span>;
  return (
    <span className={"hx-delta hx-delta-" + change.tone} title="Change since the previous run">
      {change.tone === "up" ? "▲ " : "▼ "}
      {formatDelta(change.delta)}
    </span>
  );
}

function StatCard({ label, value, change, hint }) {
  return (
    <div className="dx-stat">
      <span className="dx-stat-label">{label}</span>
      <span className="dx-stat-value">
        {value}
        <Change change={change} />
      </span>
      <span className="dx-stat-hint">{hint}</span>
    </div>
  );
}

function displayName(user) {
  if (user && user.name) return user.name;
  if (user && user.email) return user.email.split("@")[0];
  return "there";
}

/* ---------- page ---------- */

export default function Dashboard() {
  const { user } = useAuth();
  const [analyses, reloadAnalyses] = useResource(listAnalyses);
  const [loops] = useResource(listLoops);

  let body;
  if (analyses.status === "loading") {
    body = (
      <div className="panel">
        <p className="desc">Loading your dashboard…</p>
      </div>
    );
  } else if (analyses.status === "error") {
    body = (
      <div className="panel">
        <h3>Could not load your dashboard</h3>
        <p style={{ color: "var(--gap)" }}>{analyses.error}</p>
        <button className="btn secondary" onClick={reloadAnalyses}>
          Try again
        </button>
      </div>
    );
  } else if (analyses.data.items.length === 0) {
    body = (
      <div className="panel">
        <h3>No analyses yet</h3>
        <p className="desc">
          Upload your resume (and a job description if you have one) to get your first ATS and match scores. They will show
          up here so you can track your progress.
        </p>
        <Link to="/upload" className="btn">
          Start a new analysis
        </Link>
      </div>
    );
  } else {
    const stats = buildStats(analyses.data.items);
    const loopItems = loops.status === "done" ? loops.data.items : null;
    const gain = loopItems ? bestLoopGain(loopItems) : null;

    const recentRows = [];
    for (let i = 0; i < stats.recent.length; i++) {
      const a = stats.recent[i];
      recentRows.push(
        <div className="dx-row" key={a.id}>
          <div className="dx-row-main">
            <span className="dx-row-title">{jobLabel(a)}</span>
            <span className="hx-muted">{formatDate(a.created_at)}</span>
          </div>
          <div className="dx-row-scores">
            <span className="tag">{a.flow === "resume_only" ? "Resume only" : "Resume + job"}</span>
            {typeof a.ats_score === "number" && (
              <span>
                ATS <strong>{a.ats_score}</strong>
              </span>
            )}
            {typeof a.match_score === "number" && (
              <span>
                Match <strong>{a.match_score}</strong>
              </span>
            )}
          </div>
        </div>
      );
    }

    body = (
      <>
        <div className="dx-stats">
          <StatCard
            label="Latest ATS score"
            value={stats.latestAts ? stats.latestAts.ats_score : "–"}
            change={stats.atsChange}
            hint={stats.latestAts ? formatDate(stats.latestAts.created_at) : "Run an ATS check"}
          />
          <StatCard
            label="Latest match score"
            value={stats.latestMatch ? stats.latestMatch.match_score : "–"}
            change={stats.matchChange}
            hint={stats.latestMatch ? jobLabel(stats.latestMatch) : "Match your resume to a job"}
          />
          <StatCard label="Analyses run" value={stats.total} hint="All time" />
          <StatCard
            label="Improvement loops"
            value={loopItems ? loopItems.length : "–"}
            hint={gain !== null ? "Best gain " + formatDelta(gain) : "No loop runs yet"}
          />
        </div>

        <div className="panel">
          <h3>Score over time</h3>
          <p className="desc">Your latest {stats.labels.length} analyses, oldest to newest.</p>
          {stats.mixedJobs && (
            <p className="hx-note">
              The match line mixes different jobs, so ups and downs can come from the job and not only your resume. Open
              History to filter by one job.
            </p>
          )}
          <TrendChart
            labels={stats.labels}
            ariaLabel="Match score and ATS score over your latest analyses"
            series={[
              { name: "Match score", color: "var(--match)", values: stats.matchValues },
              { name: "ATS score", color: "var(--gold)", values: stats.atsValues },
            ]}
          />
        </div>

        <div className="panel" style={{ marginTop: "1.2rem" }}>
          <div className="hx-panel-head">
            <h3>Recent analyses</h3>
            <Link to="/history" className="btn secondary">
              View all history
            </Link>
          </div>
          <div className="dx-recent">{recentRows}</div>
        </div>

        <div className="panel" style={{ marginTop: "1.2rem" }}>
          <h3>Quick actions</h3>
          <div className="dx-actions">
            <Link to="/upload" className="btn">
              New analysis
            </Link>
            <Link to="/resume-rewrite" className="btn secondary">
              Rewrite my resume
            </Link>
            <Link to="/improvement-loop" className="btn secondary">
              Improvement loop
            </Link>
            <Link to="/history" className="btn secondary">
              Compare runs
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="shell">
      <Sidebar />
      <section className="route" style={{ padding: "2rem" }}>
        <div className="page-head">
          <div>
            <span className="kicker"></span>
            <h1>Welcome, {displayName(user)}</h1>
            <p>Here is how your resume is doing.</p>
          </div>
          <Link to="/upload" className="btn">
            New analysis
          </Link>
        </div>
        {body}
        <footer className="note">SkillGap AI</footer>
      </section>
    </div>
  );
}