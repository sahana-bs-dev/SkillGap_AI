import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import AnalysisLoader from "../../components/AnalysisLoader";
import EmptyState from "../../components/EmptyState/EmptyState";
import { runSkillGapAnalysis, runLearningPlan } from "../../api/analyzeApi";
import { getLatestPlan, getPlan, getPlanByAnalysis, createPlan, listPlans, saveProgress } from "../../api/skillPlanApi";
import "../MatchReport/MatchReport.css"; // shared page styles (.route width + .sg- skill gap styles)
import Sidebar from "../../components/Layout/Sidebar";
import "../../components/Layout/Sidebar.css";

// Route: /skill-gap
//   From the Match Report page: navigate("/skill-gap", { state: { matchingOutput, resumeText } })
//     -> loads the saved plan for that analysis, or builds one and saves it.
//   From the sidebar (no state): opens your latest saved plan, ticks included.
// Ticks are saved to the server a moment after each click, so progress survives a reload.
// A job picker (shown when you have plans for 2+ jobs) opens the newest saved plan of another job.
// A skill counts as "learned" when every one of its steps is ticked. Learned skills can be
// sent to Resume Rewrite, which reads them from the saved plan (so it also survives a reload).

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

const LOADER_MESSAGES = [
  "Finding the skills worth working on",
  "Ranking gaps by importance",
  "Choosing projects and resources",
  "Putting your learning plan together",
];

export default function SkillGapPlan() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const matchingOutput = state?.matchingOutput;

  // 'empty' = no match report yet, 'loading' | 'done' | 'error' as before
  const [status, setStatus] = useState("loading");
  const [gaps, setGaps] = useState([]);
  const [plan, setPlan] = useState([]);
  const [checked, setChecked] = useState({}); // { "skill::step": true }
  const [attempt, setAttempt] = useState(0); // goes up by one on "Try again"

  // The saved plan this page is showing: { planId, resumeText, matchingOutput, jdTitle }.
  // null when nothing could be saved (for example a match report from before plans were saved).
  const [saved, setSaved] = useState(null);
  // 'idle' | 'saving' | 'saved' | 'error' | 'off'
  const [saveState, setSaveState] = useState("idle");
  const [chosenPlanId, setChosenPlanId] = useState(null); // set when you pick another job in the job picker
  const [planList, setPlanList] = useState([]); // short list of all saved plans, for the job picker
  const [goingToRewrite, setGoingToRewrite] = useState(false);
  const [rewriteError, setRewriteError] = useState("");

  // The Resume Rewrite page needs these; fall back to the saved copies when opened from the sidebar.
  // After picking another job in the picker, the match report data in `state` belongs to a different job.
  const resumeText = chosenPlanId ? saved?.resumeText : state?.resumeText ?? saved?.resumeText;
  const matchingForRewrite = chosenPlanId ? saved?.matchingOutput : matchingOutput ?? saved?.matchingOutput;

  // Saving ticks: always send the full map, one request at a time, a moment after the last click.
  const planIdRef = useRef(null);
  const latestChecked = useRef({});
  const timerRef = useRef(null);
  const inFlight = useRef(false);
  const saveAgain = useRef(false);

  async function flushProgress() {
    const id = planIdRef.current;
    if (!id) return;
    if (inFlight.current) {
      saveAgain.current = true; // a save is running: send the newest ticks right after it
      return;
    }
    inFlight.current = true;
    setSaveState("saving");
    try {
      await saveProgress(id, latestChecked.current);
      setSaveState("saved");
    } catch (err) {
      console.error("Could not save progress:", err);
      setSaveState("error");
    } finally {
      inFlight.current = false;
      if (saveAgain.current) {
        saveAgain.current = false;
        flushProgress();
      }
    }
  }

  // Leaving the page right after a click must not lose that tick.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        flushProgress();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;

    function showSaved(p) {
      planIdRef.current = p.id;
      latestChecked.current = p.checked || {};
      setGaps(p.gaps || []);
      setPlan(p.plan || []);
      setChecked(p.checked || {});
      setSaved({
        planId: p.id,
        resumeText: p.resume_text,
        matchingOutput: p.matching_output,
        jdTitle: p.jd_title,
      });
      setSaveState("saved");
      setStatus("done");
    }

    async function load() {
      setStatus("loading");

      try {
        // Picked another job in the job picker: show that job's plan.
        if (chosenPlanId) {
          const picked = await getPlan(chosenPlanId);
          if (cancelled) return;
          if (picked) showSaved(picked);
          else setStatus("empty");
          return;
        }

        // Opened from the sidebar: show the latest saved plan.
        if (!matchingOutput) {
          const latest = await getLatestPlan();
          if (cancelled) return;
          if (latest) showSaved(latest);
          else setStatus("empty");
          return;
        }

        // Came from a match report: reuse the plan already saved for this analysis.
        const analysisId = matchingOutput.analysis_id;
        if (analysisId) {
          try {
            const existing = await getPlanByAnalysis(analysisId);
            if (cancelled) return;
            if (existing) {
              showSaved(existing);
              return;
            }
          } catch (err) {
            console.error("Could not look up the saved plan:", err); // build a new one instead
          }
        }

        const gapResult = await runSkillGapAnalysis(matchingOutput);
        if (cancelled) return;
        const builtGaps = gapResult.gaps || [];

        const learningResult = await runLearningPlan(builtGaps);
        if (cancelled) return;
        const builtPlan = learningResult.plan || [];

        // Save it. If saving fails the plan still shows, it just will not be kept.
        let savedPlan = null;
        if (analysisId) {
          try {
            savedPlan = await createPlan({
              analysis_id: analysisId,
              resume_text: state?.resumeText || "",
              matching_output: matchingOutput,
              gaps: builtGaps,
              plan: builtPlan,
            });
          } catch (err) {
            console.error("Could not save the skill plan:", err);
          }
          if (cancelled) return;
        }

        if (savedPlan) {
          // Use the server's copy: for the same job it already carries over earlier ticks.
          showSaved(savedPlan);
        } else {
          planIdRef.current = null;
          latestChecked.current = {};
          setGaps(builtGaps);
          setPlan(builtPlan);
          setChecked({});
          setSaved(null);
          setSaveState("off");
          setStatus("done");
        }
      } catch (err) {
        if (cancelled) return;
        // The real error stays in the console for you; the user sees a friendly message.
        console.error("Skill gap plan failed:", err);
        setStatus("error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [matchingOutput, attempt, chosenPlanId]); // eslint-disable-line react-hooks/exhaustive-deps

  // The list for the job picker. It is read again whenever the plan on screen changes (for example a new plan was saved).
  useEffect(() => {
    if (!saved?.planId) return;
    let cancelled = false;
    listPlans()
      .then((list) => {
        if (!cancelled) setPlanList(list);
      })
      .catch((err) => console.error("Could not load the plan list:", err)); // the picker just stays hidden
    return () => {
      cancelled = true;
    };
  }, [saved?.planId]);

  // One entry per job (the newest plan of each), newest job first.
  const planJobs = [];
  planList.forEach((p) => {
    const key = p.jd_fingerprint || p.jd_title || p.id;
    if (!planJobs.some((j) => j.key === key)) planJobs.push({ key: key, planId: p.id, title: p.jd_title || "Untitled job", pct: p.progress?.pct ?? 0 });
  });
  const currentPlanSummary = planList.find((p) => p.id === saved?.planId);
  const currentJobKey = currentPlanSummary ? currentPlanSummary.jd_fingerprint || currentPlanSummary.jd_title || currentPlanSummary.id : "";

  // Switching jobs: make sure the ticks on this page are saved first.
  async function switchJob(key) {
    const target = planJobs.find((j) => j.key === key);
    if (!target || target.planId === saved?.planId) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (planIdRef.current) {
      try {
        await saveProgress(planIdRef.current, latestChecked.current);
      } catch (err) {
        console.error("Could not save before switching jobs:", err);
      }
    }
    setChosenPlanId(target.planId);
  }

  const sortedGaps = [...gaps].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
  );

  function planFor(skill) {
    return plan.find((p) => p.skill === skill);
  }

  function toggleStep(skill, step) {
    const key = `${skill}::${step}`;
    const next = { ...latestChecked.current };
    if (next[key]) delete next[key];
    else next[key] = true;
    latestChecked.current = next;
    setChecked(next);

    if (!planIdRef.current) return; // nothing saved for this plan: the tick only lives on this page
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      flushProgress();
    }, 500);
  }

  function stepProgress(skill) {
    const p = planFor(skill);
    if (!p) return { done: 0, total: 0 };
    const steps = stepsFor(p);
    const done = steps.filter((s) => checked[`${skill}::${s.key}`]).length;
    return { done, total: steps.length };
  }

  function stepsFor(p) {
    const steps = [];
    if (p.learn_resources?.length) steps.push({ key: "learn", label: "Learn", items: p.learn_resources });
    if (p.practice_resources?.length) steps.push({ key: "practice", label: "Practice", items: p.practice_resources });
    if (p.build_project) steps.push({ key: "build", label: "Build", items: [p.build_project] });
    return steps;
  }

  /* ---------- derived numbers for the summary ---------- */
  const counts = { high: 0, medium: 0, low: 0 };
  let totalSteps = 0;
  let doneSteps = 0;
  const learnedSkills = []; // every step ticked
  sortedGaps.forEach((g) => {
    if (counts[g.priority] !== undefined) counts[g.priority] += 1;
    const pr = stepProgress(g.skill);
    totalSteps += pr.total;
    doneSteps += pr.done;
    if (pr.total > 0 && pr.done === pr.total) learnedSkills.push(g.skill);
  });
  const overallPct = totalSteps ? Math.round((doneSteps / totalSteps) * 100) : 0;

  // Make sure the newest ticks are on the server first: Resume Rewrite reads them from the saved plan.
  async function goToRewriteWithLearned() {
    if (!planIdRef.current || learnedSkills.length === 0 || goingToRewrite) return;
    setGoingToRewrite(true);
    setRewriteError("");
    try {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      await saveProgress(planIdRef.current, latestChecked.current);
      setSaveState("saved");
      navigate("/resume-rewrite", {
        state: { resumeText, matchingOutput: matchingForRewrite, gaps, planId: planIdRef.current },
      });
    } catch (err) {
      console.error("Could not save before opening Resume Rewrite:", err);
      setRewriteError("Could not save your progress, so the learned skills were not sent. Please try again.");
      setGoingToRewrite(false);
    }
  }

  function jumpTo(id, e) {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- sections ---------- */

  function renderSummaryGroups() {
    const groups = [
      { key: "high", label: "High priority" },
      { key: "medium", label: "Medium priority" },
      { key: "low", label: "Low priority" },
    ];
    return groups.map((grp) => {
      const items = sortedGaps
        .map((g, i) => ({ g, i }))
        .filter(({ g }) => (PRIORITY_ORDER[g.priority] !== undefined ? g.priority : "medium") === grp.key);
      if (items.length === 0) return null;
      return (
        <div className="sg-group" key={grp.key}>
          <div className="sg-group-label">
            <span className={"sg-dot " + grp.key} />
            {grp.label}
            <span className="sg-group-count">{items.length}</span>
          </div>
          <div className="sg-chips">
            {items.map(({ g, i }) => {
              const pr = stepProgress(g.skill);
              const finished = pr.total > 0 && pr.done === pr.total;
              return (
                <a
                  className={"sg-chip" + (finished ? " done" : "")}
                  key={"chip-" + i}
                  href={"#gap-" + i}
                  onClick={(e) => jumpTo("gap-" + i, e)}
                >
                  <span>{g.skill}</span>
                  {finished && (
                    <em aria-label="All steps done">
                      <CheckIcon />
                    </em>
                  )}
                  {!finished && pr.done > 0 && (
                    <em>
                      {pr.done} of {pr.total}
                    </em>
                  )}
                </a>
              );
            })}
          </div>
        </div>
      );
    });
  }

  function renderStepItems(items) {
    return items.map((item, k) => {
      if (typeof item === "string") {
        return (
          <p className="sg-step-text" key={"item-" + k}>
            {decodeEntities(item)}
          </p>
        );
      }
      return (
        <a
          className="sg-link"
          key={"item-" + k}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <span>{decodeEntities(item.title)}</span>
          <ExternalIcon />
        </a>
      );
    });
  }

  function renderSteps(gap, steps) {
    return steps.map((step, s) => {
      const isDone = !!checked[`${gap.skill}::${step.key}`];
      return (
        <div
          key={step.key}
          className={"sg-step" + (isDone ? " done" : "")}
          role="checkbox"
          aria-checked={isDone}
          tabIndex={0}
          onClick={() => toggleStep(gap.skill, step.key)}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              toggleStep(gap.skill, step.key);
            }
          }}
        >
          <span className="sg-check">{isDone && <CheckIcon />}</span>
          <div className="sg-step-body">
            <div className="sg-step-label">
              <span className="sg-step-num">{s + 1}</span>
              {step.label}
            </div>
            {renderStepItems(step.items)}
          </div>
        </div>
      );
    });
  }

  function renderGapCards() {
    return sortedGaps.map((gap, i) => {
      const p = planFor(gap.skill);
      const steps = p ? stepsFor(p) : [];
      const pr = stepProgress(gap.skill);
      const pri = PRIORITY_ORDER[gap.priority] !== undefined ? gap.priority : "medium";

      // The Build step already shows one project, so don't list it twice above.
      const extraProjects = (gap.suggested_projects || []).filter((proj) => proj !== p?.build_project);

      return (
        <div className="sg-card" id={"gap-" + i} key={"card-" + i}>
          <div className="sg-card-head">
            <h3>{gap.skill}</h3>
            <span className={"sg-pill " + pri}>
              <span className={"sg-dot " + pri} />
              {pri}
            </span>
          </div>

          {pr.total > 0 && (
            <div className="sg-progress">
              <div className="sg-bar">
                <div className="sg-bar-fill" style={{ width: `${(pr.done / pr.total) * 100}%` }} />
              </div>
              <span>
                {pr.done} of {pr.total} steps done
              </span>
            </div>
          )}

          {steps.length > 0 ? (
            <div className="sg-steps">{renderSteps(gap, steps)}</div>
          ) : (
            <p className="sg-none">No curated resources found for this skill yet.</p>
          )}

          {extraProjects.length > 0 && (
            <div className="sg-ideas">
              <span className="sg-ideas-label">More project ideas</span>
              <ul>
                {extraProjects.map((proj, j) => (
                  <li key={"project-" + j}>{decodeEntities(proj)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    });
  }

  return (
    <div className="shell">
      <Sidebar />
      <section className="route" style={{ padding: "2rem" }}>
        <div className="page-head">
          <div>
            <span className="kicker"></span>
            <h1>Skill gap &amp; learning plan</h1>
            <p>Prioritized gaps from your match report, with a Learn → Practice → Build plan for each</p>
          </div>
          {status !== "empty" && matchingOutput && !chosenPlanId ? (
            <Link to="/match-report" className="btn secondary">
              Back to match report
            </Link>
          ) : null}
        </div>

        {status === "loading" && (
          <AnalysisLoader title="Building your learning plan" messages={LOADER_MESSAGES} />
        )}

        {status === "empty" && (
          <EmptyState
            title="No skill gaps to show yet"
            message="Match your resume against a job description first. Your skill gaps and learning plan will appear here."
            actionLabel="Start a new analysis"
            actionTo="/upload"
          />
        )}

        {status === "error" && (
          <EmptyState
            title="We couldn't build your plan"
            message="Something went wrong while building your learning plan. Please try again."
            actionLabel="Try again"
            onAction={() => setAttempt(attempt + 1)}
          />
        )}

        {status === "done" && sortedGaps.length === 0 && (
          <div className="sg-card">
            <p className="sg-none">No skill gaps to close — great coverage on this match.</p>
          </div>
        )}

        {status === "done" && sortedGaps.length > 0 && (
          <div className="sg-page">
            {/* ---------- job picker ---------- */}
            {planJobs.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: ".9rem" }}>Showing the skill gaps and learning plan for:</span>
                <select
                  value={currentJobKey}
                  onChange={(e) => switchJob(e.target.value)}
                  aria-label="Choose a job"
                  style={{
                    padding: ".5rem .8rem",
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    background: "var(--paper)",
                    font: "inherit",
                    maxWidth: "100%",
                  }}
                >
                  {planJobs.map((j) => (
                    <option value={j.key} key={j.key}>
                      {j.title} ({j.pct}% done)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ---------- overview ---------- */}
            <div className="sg-overview">
              <div className="sg-overview-top">
                <div className="sg-kpis">
                  <div className="sg-kpi">
                    <strong>{sortedGaps.length}</strong>
                    <span>Skills to close</span>
                  </div>
                  <div className="sg-kpi">
                    <strong className="high">{counts.high}</strong>
                    <span>High</span>
                  </div>
                  <div className="sg-kpi">
                    <strong className="medium">{counts.medium}</strong>
                    <span>Medium</span>
                  </div>
                  <div className="sg-kpi">
                    <strong className="low">{counts.low}</strong>
                    <span>Low</span>
                  </div>
                </div>

                <div className="sg-overall">
                  <div className="sg-overall-row">
                    <span>Your progress</span>
                    <strong>
                      {doneSteps} of {totalSteps} steps done
                    </strong>
                  </div>
                  <div className="sg-bar big">
                    <div className="sg-bar-fill" style={{ width: `${overallPct}%` }} />
                  </div>
                  <p className="sg-hint">
                    Tick a step in any card below once you finish it.
                    {saveState === "saved" && " Your progress is saved automatically."}
                    {saveState === "saving" && " Saving…"}
                    {saveState === "error" && " Could not save your last change. It will retry on your next tick."}
                    {saveState === "off" && " This plan can't be saved. Run a new match to keep your progress."}
                  </p>
                  {saved?.jdTitle && <p className="sg-hint">Plan for: {saved.jdTitle}</p>}
                </div>
              </div>

              <div className="sg-groups">{renderSummaryGroups()}</div>
            </div>

            {/* ---------- learned skills -> Resume Rewrite ---------- */}
            <div className="sg-cta">
              <div>
                <h3>Skills you've learned: {learnedSkills.length}</h3>
                <p>
                  {learnedSkills.length > 0
                    ? learnedSkills.join(", ")
                    : "Finish all steps of a skill (Learn, Practice and Build) to add it to your resume."}
                </p>
                {!saved?.planId && (
                  <p>This plan can't be saved, so learned skills can't be sent to Resume Rewrite. Run a new match first.</p>
                )}
                {rewriteError && <p style={{ color: "var(--gap)" }}>{rewriteError}</p>}
              </div>
              <button
                type="button"
                className="sg-cta-btn"
                style={{
                  border: 0,
                  cursor: learnedSkills.length > 0 && saved?.planId ? "pointer" : "not-allowed",
                  fontFamily: "inherit",
                  opacity: learnedSkills.length > 0 && saved?.planId ? 1 : 0.45,
                }}
                disabled={learnedSkills.length === 0 || !saved?.planId || goingToRewrite}
                onClick={goToRewriteWithLearned}
              >
                {goingToRewrite
                  ? "Saving…"
                  : learnedSkills.length > 0
                  ? `Add ${learnedSkills.length} learned ${learnedSkills.length === 1 ? "skill" : "skills"} to my resume`
                  : "Add learned skills to my resume"}
                <ArrowIcon />
              </button>
            </div>

            {/* ---------- one card per skill ---------- */}
            <div className="sg-grid">{renderGapCards()}</div>

            {/* ---------- next step ---------- */}
            <div className="sg-cta">
              <div>
                <h3>Ready to update your resume?</h3>
                <p>Add the projects you build and let Resume Rewrite work them in.</p>
              </div>
              <Link to="/resume-rewrite" state={{ resumeText, matchingOutput: matchingForRewrite, gaps }} className="sg-cta-btn">
                Go to Resume Rewrite <ArrowIcon />
              </Link>
            </div>
          </div>
        )}

        <footer className="note">SkillGap AI</footer>
      </section>
    </div>
  );
}

/* ---------- helpers ---------- */

// Some video titles arrive with HTML entities (e.g. "Ma&#39;am"). Turn them back into text.
function decodeEntities(text) {
  if (typeof text !== "string" || !text.includes("&")) return text;
  const doc = new DOMParser().parseFromString(text, "text/html");
  return doc.documentElement.textContent || text;
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
const ExternalIcon = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);