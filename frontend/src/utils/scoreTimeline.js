// Builds the points for the History and Dashboard score charts.
//
// One point per analysis, plus one point per scored resume rewrite of an analysis in scope
// (the rewrite's score is saved on the version as version.scores, see the backend).
//   kind "analysis" = the score from the analysis itself (hollow dot)
//   kind "rewrite"  = the score after a rewrite (filled dot)
// jobFilter is a job key (see jobKey in historyStats.js) or "all".

import { byDateAsc, jobKey, parseApiDate } from "./historyStats";

function num(value) {
  return typeof value === "number" && !isNaN(value) ? value : null;
}

function dayKey(value) {
  const d = parseApiDate(value);
  return d ? d.toDateString() : "";
}

function dayText(value) {
  const d = parseApiDate(value);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
}

function clock(value) {
  const d = parseApiDate(value);
  return d ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
}

export function buildTimeline(analyses, versions, jobFilter) {
  const inScope = (analyses || []).filter((a) => jobFilter === "all" || jobKey(a) === jobFilter);
  const ids = new Set(inScope.map((a) => a.id));

  const points = inScope.map((a) => ({
    kind: "analysis",
    id: a.id,
    created_at: a.created_at,
    match: num(a.match_score),
    ats: num(a.ats_score),
    learned: 0,
  }));

  (versions || []).forEach((v) => {
    const s = v.scores;
    if (!s || !ids.has(s.analysis_id)) return;
    if (num(s.match_after) === null && num(s.ats_after) === null) return;
    points.push({
      kind: "rewrite",
      id: v.id,
      created_at: v.created_at,
      match: num(s.match_after),
      ats: num(s.ats_after),
      learned: v.learned_skill_count || 0,
      versionNo: v.version_no,
    });
  });

  const sorted = byDateAsc(points);

  // Same-day points all had the label "20 Oct", so name each one instead:
  // "Analysis 1", "Analysis 2", "Version 4" ... and put the time (or the date) underneath.
  let analysisNo = 0;
  const labels = sorted.map((p) => (p.kind === "rewrite" ? "Version " + p.versionNo : "Analysis " + ++analysisNo));
  const days = new Set(sorted.map((p) => dayKey(p.created_at)));
  const subLabels = sorted.map((p) => (days.size === 1 ? clock(p.created_at) : dayText(p.created_at)));

  return {
    points: sorted,
    labels: labels,
    subLabels: subLabels,
    matchValues: sorted.map((p) => p.match),
    atsValues: sorted.map((p) => p.ats),
    kinds: sorted.map((p) => p.kind),
    rewriteCount: sorted.filter((p) => p.kind === "rewrite").length,
    analysisCount: sorted.filter((p) => p.kind === "analysis").length,
  };
}

// The newest scored rewrite of one analysis (or null).
export function latestRewriteFor(versions, analysisId) {
  const list = (versions || []).filter(
    (v) => v.scores && v.scores.analysis_id === analysisId && (num(v.scores.match_after) !== null || num(v.scores.ats_after) !== null)
  );
  if (list.length === 0) return null;
  return byDateAsc(list)[list.length - 1];
}