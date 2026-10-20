import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";
import TrendChart from "../../components/TrendChart";
import { useAuth } from "../../context/AuthContext";
import { listAnalyses } from "../../api/historyApi";
import { listResumeVersions } from "../../api/rewriteApi";
import LearningProgress from "../../components/LearningProgress/LearningProgress";
import { useSkillPlans, planForAnalysis, learnedCount } from "../../utils/skillPlanStats";
import {
  byDateAsc,
  byDateDesc,
  formatDate,
  formatDay,
  formatDelta,
  jobKey,
  jobLabel,
  parseApiDate,
  scoreChange,
} from "../../utils/historyStats";
import { buildTimeline, latestRewriteFor } from "../../utils/scoreTimeline";
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
  const [versions] = useResource(listResumeVersions); // used for "after rewrite" scores; the page works without it
  const [jobChoice, setJobChoice] = useState(null); // null = your latest job
  const skillPlans = useSkillPlans(); // saved learning plans; if they fail to load the page just shows no learning info

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
    // Jobs you have matched against, newest first. The dashboard shows one job at a time.
    const matchRuns = byDateDesc(analyses.data.items).filter((a) => jobKey(a) && typeof a.match_score === "number");
    const jobs = [];
    matchRuns.forEach((a) => {
      const existing = jobs.find((j) => j.key === jobKey(a));
      if (existing) existing.count += 1;
      else jobs.push({ key: jobKey(a), label: jobLabel(a), count: 1 });
    });
    const latestJobKey = jobs.length > 0 ? jobs[0].key : "";
    const jobFocus = jobChoice && jobs.some((j) => j.key === jobChoice) ? jobChoice : latestJobKey;
    const focusIndex = matchRuns.findIndex((a) => jobKey(a) === jobFocus);
    const focusMatch = focusIndex === -1 ? null : matchRuns[focusIndex]; // newest analysis of the chosen job
    const previousRun = focusIndex === -1 ? undefined : matchRuns.slice(focusIndex + 1).find((a) => jobKey(a) === jobFocus);
    const focusMatchChange = focusMatch && previousRun ? scoreChange(previousRun.match_score, focusMatch.match_score) : null;

    // The saved learning plan for the chosen job's newest match (if you have opened its Skill gap page).
    const latestPlan = focusMatch ? planForAnalysis(skillPlans.plans, focusMatch.id) : null;
    const learnedNow = learnedCount(latestPlan);
    const missingCount = focusMatch ? (focusMatch.missing_skills || []).length : null;
    // With a plan, learned skills no longer count as skills to close.
    const openGaps = missingCount !== null ? Math.max(0, missingCount - learnedNow) : null;

    // Scores taken after a resume rewrite (saved on each version) count as your newest scores.
    const versionList = versions.status === "done" ? versions.data : [];
    const rewrite = focusMatch ? latestRewriteFor(versionList, focusMatch.id) : null;
    const rs = rewrite ? rewrite.scores : null;
    const matchAfter = rs && typeof rs.match_after === "number";
    const atsAfter =
      rs &&
      typeof rs.ats_after === "number" &&
      (!stats.latestAts || parseApiDate(rewrite.created_at) > parseApiDate(stats.latestAts.created_at));

    // Chart: your latest job only (analyses + rewrites), so lines never mix unrelated jobs.
    const chartJobKey = jobFocus;
    const timeline = chartJobKey ? buildTimeline(analyses.data.items, versionList, chartJobKey) : null;
    const useTimeline = Boolean(timeline && timeline.points.length > 0);
    const tail = (list) => list.slice(Math.max(0, list.length - CHART_POINTS));
    // Start / latest / best match score of the points shown, so the line is easy to read.
    const shownMatch = useTimeline ? tail(timeline.matchValues).filter((v) => typeof v === "number") : [];
    const matchSummary =
      shownMatch.length >= 2
        ? { start: shownMatch[0], latest: shownMatch[shownMatch.length - 1], best: Math.max(...shownMatch) }
        : null;

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
        {jobs.length > 1 && (
          <div className="hx-panel-head" style={{ marginBottom: "1rem" }}>
            <span className="desc">Showing your match scores, skills and learning progress for:</span>
            <label className="hx-filter">
              <select value={jobFocus} onChange={(e) => setJobChoice(e.target.value)} aria-label="Choose a job">
                {jobs.map((j) => (
                  <option value={j.key} key={j.key}>
                    {j.label} ({j.count})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="dx-stats">
          <StatCard
            label="Latest ATS score"
            value={atsAfter ? rs.ats_after : stats.latestAts ? stats.latestAts.ats_score : "–"}
            change={atsAfter ? scoreChange(rs.ats_before, rs.ats_after) : stats.atsChange}
            hint={
              atsAfter
                ? "After your latest rewrite"
                : stats.latestAts
                ? formatDate(stats.latestAts.created_at)
                : "Run an ATS check"
            }
          />
          <StatCard
            label="Latest match score"
            value={matchAfter ? rs.match_after : focusMatch ? focusMatch.match_score : "–"}
            change={matchAfter ? scoreChange(rs.match_before, rs.match_after) : focusMatchChange}
            hint={
              focusMatch
                ? (matchAfter ? "After your latest rewrite · " : "") + jobLabel(focusMatch)
                : "Match your resume to a job"
            }
          />
          <StatCard label="Analyses run" value={stats.total} hint="All time" />
          <StatCard
            label="Skills to close"
            value={openGaps !== null ? openGaps : "–"}
            hint={
              openGaps === null
                ? "Match your resume to a job"
                : learnedNow > 0
                ? learnedNow + " learned from your plan"
                : "Missing in your latest match"
            }
          />
        </div>

        <LearningProgress plan={latestPlan} />

        <div className="panel">
          <h3>{useTimeline ? "Score over time for " + jobLabel(focusMatch) : "Score over time"}</h3>
          <p className="desc">
            {useTimeline
              ? "Your latest " + tail(timeline.labels).length + " scores for this job, oldest to newest. A filled dot is a score taken after a resume rewrite."
              : "Your latest " + stats.labels.length + " analyses, oldest to newest."}
          </p>
          {matchSummary && (
            <p className="desc">
              Match score: started at <strong>{matchSummary.start}</strong>, latest <strong>{matchSummary.latest}</strong>
              , best <strong>{matchSummary.best}</strong>.
            </p>
          )}
          {!useTimeline && stats.mixedJobs && (
            <p className="hx-note">
              The match line mixes different jobs, so ups and downs can come from the job and not only your resume. Open
              History to filter by one job.
            </p>
          )}
          <TrendChart
            labels={useTimeline ? tail(timeline.labels) : stats.labels}
            subLabels={useTimeline ? tail(timeline.subLabels) : undefined}
            pointKinds={useTimeline ? tail(timeline.kinds) : undefined}
            ariaLabel="Match score and ATS score over your latest analyses"
            series={[
              { name: "Match score", color: "var(--match)", values: useTimeline ? tail(timeline.matchValues) : stats.matchValues },
              { name: "ATS score", color: "var(--gold)", values: useTimeline ? tail(timeline.atsValues) : stats.atsValues },
            ]}
          />
          {useTimeline && timeline.rewriteCount > 0 && (
            <p className="hx-note">
              Every rewrite starts again from your original resume, not from the previous rewrite, and match scores come
              from an AI check. So two rewrites can score differently, and the line can dip. Look at the latest and best
              scores rather than every dip.
            </p>
          )}
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
            <Link to="/skill-gap" className="btn secondary">
              Skill gap plan
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