// Pure helpers for the History and Compare pages (no React, easy to test).

/* ---------- dates ---------- */

// Times from the backend may have no "Z" (they are UTC); without it the browser reads them as local time.
export function parseApiDate(value) {
  if (!value) return null;
  const hasZone = /[zZ]$|[+-]\d\d:?\d\d$/.test(value);
  const date = new Date(hasZone ? value : value + "Z");
  return isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  const d = parseApiDate(value);
  return d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
}

export function formatDay(value) {
  const d = parseApiDate(value);
  return d ? d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
}

function time(item) {
  const d = parseApiDate(item && item.created_at);
  return d ? d.getTime() : 0;
}

export function byDateAsc(list) {
  return (list || []).slice().sort((a, b) => time(a) - time(b));
}

export function byDateDesc(list) {
  return (list || []).slice().sort((a, b) => time(b) - time(a));
}

/* ---------- jobs ---------- */

export function jobKey(item) {
  return (item && (item.jd_fingerprint || item.jd_title)) || "";
}

export function jobLabel(item) {
  if (item && item.jd_title) return item.jd_title;
  return item && item.flow === "resume_only" ? "Resume only (no job)" : "Untitled job";
}

// "same" | "different" | "unknown" (a resume-only analysis has no job to compare)
export function jdRelation(a, b) {
  const ka = jobKey(a);
  const kb = jobKey(b);
  if (!ka || !kb) return "unknown";
  return ka === kb ? "same" : "different";
}

/* ---------- scores ---------- */

export function scoreChange(from, to) {
  if (typeof from !== "number" || typeof to !== "number") return null;
  const delta = Math.round((to - from) * 10) / 10;
  return { from: from, to: to, delta: delta, tone: delta > 0 ? "up" : delta < 0 ? "down" : "flat" };
}

export function formatDelta(delta) {
  if (delta > 0) return "+" + delta;
  if (delta < 0) return "\u2212" + Math.abs(delta);
  return "no change";
}

/* ---------- skills ---------- */

function skillMap(list) {
  const map = new Map();
  const items = list || [];
  for (let i = 0; i < items.length; i++) {
    const label = String(items[i] || "").trim();
    const key = label.toLowerCase();
    if (key && !map.has(key)) map.set(key, label);
  }
  return map;
}

// How the skills changed between an earlier and a later analysis.
export function compareSkills(earlier, later) {
  const aMatched = skillMap(earlier.matched_skills);
  const aMissing = skillMap(earlier.missing_skills);
  const bMatched = skillMap(later.matched_skills);
  const bMissing = skillMap(later.missing_skills);

  const out = { gained: [], lost: [], stillMatched: [], stillMissing: [], onlyEarlier: [], onlyLater: [] };
  const keys = new Set([...aMatched.keys(), ...aMissing.keys(), ...bMatched.keys(), ...bMissing.keys()]);

  keys.forEach(function (key) {
    const a = aMatched.has(key) ? "matched" : aMissing.has(key) ? "missing" : null;
    const b = bMatched.has(key) ? "matched" : bMissing.has(key) ? "missing" : null;
    const label = aMatched.get(key) || aMissing.get(key) || bMatched.get(key) || bMissing.get(key);

    if (a && !b) out.onlyEarlier.push(label);
    else if (!a && b) out.onlyLater.push(label);
    else if (a === "missing" && b === "matched") out.gained.push(label);
    else if (a === "matched" && b === "missing") out.lost.push(label);
    else if (a === "matched") out.stillMatched.push(label);
    else out.stillMissing.push(label);
  });

  Object.keys(out).forEach(function (k) {
    out[k].sort(function (x, y) { return x.localeCompare(y); });
  });
  return out;
}

function listSkills(items) {
  if (items.length <= 3) return items.join(", ");
  return items.slice(0, 3).join(", ") + " and " + (items.length - 3) + " more";
}

// One plain-language sentence about what changed.
export function describeAnalysisChange(match, skills, relation) {
  const parts = [];
  if (match) {
    if (match.tone === "flat") parts.push("Your match score stayed at " + match.to + ".");
    else {
      parts.push(
        "Your match score went " + (match.tone === "up" ? "up" : "down") + " " + Math.abs(match.delta) +
        " points (" + match.from + " to " + match.to + ")."
      );
    }
  }
  if (relation === "different") {
    parts.push("These are different jobs, so part of the change comes from the job itself.");
    return parts.join(" ");
  }
  if (skills.gained.length) parts.push("You gained " + skills.gained.length + " skill" + (skills.gained.length === 1 ? "" : "s") + " (" + listSkills(skills.gained) + ").");
  if (skills.lost.length) parts.push("You lost " + skills.lost.length + " (" + listSkills(skills.lost) + ").");
  if (!skills.gained.length && !skills.lost.length) parts.push("No skills moved between matched and missing.");
  return parts.join(" ");
}

/* ---------- improvement loops ---------- */

export function loopSummary(run) {
  const iterations = (run && run.iterations ? run.iterations : []).slice().sort(function (a, b) { return a.iteration - b.iteration; });
  if (!iterations.length) return { iterations: [], start: null, best: null, change: null, rounds: 0 };

  const start = iterations[0].score;
  let best = start;
  const wanted = run.best_iteration;
  let found = false;
  for (let i = 0; i < iterations.length; i++) {
    if (iterations[i].iteration === wanted) { best = iterations[i].score; found = true; }
  }
  if (!found) {
    for (let i = 0; i < iterations.length; i++) {
      if (iterations[i].accepted !== false && iterations[i].score > best) best = iterations[i].score;
    }
  }
  return { iterations: iterations, start: start, best: best, change: scoreChange(start, best), rounds: iterations.length - 1 };
}