# Phase 3 — Frontend: Supervisor Routing (Client-Side Stand-In) + Agent Status Indicator

**Status:** ✅ Complete and verified end-to-end

**Scope (per roadmap):** Branch the UI based on flow type, build the reusable `AgentStatusIndicator` component showing which agent is currently running.

---

## Note on Scope

Per the blueprint, Phase 3 splits as: **Friend (Backend)** — Supervisor logic + shared Pydantic schemas. **Me (Frontend)** — branch the UI based on flow type, build `AgentStatusIndicator`.

This half doesn't depend on the real Supervisor endpoint existing yet — the flow type (`mode` in `Upload.jsx`, already `"resume"` or `"both"`) is known client-side. This is a **temporary client-side stand-in** for the Supervisor's routing decision. Once the real `/supervisor` (or equivalent) endpoint ships, the only change needed is swapping the `mode === "resume" ? ... : ...` branch for whatever the endpoint returns — routes, the indicator, and the report pages all stay as-is.

---

## Folder Structure Added

```
frontend/src/
  components/
    AgentStatus/
      AgentStatusIndicator.jsx   — reusable "agent running" status pill
      AgentStatusIndicator.css
  pages/
    ATSReport/
      ATSReport.jsx              — placeholder landing page for resume-only flow
    MatchReport/
      MatchReport.jsx            — placeholder landing page for resume+JD flow
```

---

## Files Written and What Each Does

- **`components/AgentStatus/AgentStatusIndicator.jsx`** — Reusable status pill: `<AgentStatusIndicator label="..." active={true|false} />`. Renders nothing if `active` is false or `label` is empty. Used across pages (Upload, ATS report, Match report, etc.) per the blueprint's shared-component requirement.

- **`components/AgentStatus/AgentStatusIndicator.css`** — Pill styling with a pulsing status dot animation to signal "in progress."

- **`pages/ATSReport/ATSReport.jsx`** — Placeholder landing page for the resume-only flow. Reads `resumeText` from router state (`useLocation().state`) and confirms it was received. Intentionally minimal — the real score/issues/suggestions content is Phase 4 work.

- **`pages/MatchReport/MatchReport.jsx`** — Placeholder landing page for the resume+JD flow. Reads both `resumeText` and `jdText` from router state and confirms both were received. Real score/matched-skills/evidence content is Phase 5 work.

- **`pages/Upload/Upload.jsx`** (updated) — `handleSubmit` now branches after a successful parse: `mode === "resume"` routes to `/ats-report`, anything else routes to `/match-report`. Sets a routing label (`"Routing to ATS Agent…"` / `"Routing to Matching Agent…"`), shows it via `AgentStatusIndicator`, then navigates with `resumeText`/`jdText` passed as router state.

- **`App.jsx`** (updated) — Registered `/ats-report` and `/match-report` routes, both wrapped in `ProtectedRoute` following the existing pattern.

---

## Routes Added

| Path | Purpose |
|---|---|
| `/ats-report` | Landing page for "Resume only" flow — placeholder until Phase 4 |
| `/match-report` | Landing page for "Resume + job description" flow — placeholder until Phase 5 |

---

## Testing Done

- **"Resume only" flow:** Ran analysis → briefly showed "Routing to ATS Agent…" → landed on `/ats-report` → confirmed parsed resume text (character count) was received correctly from Upload.
- **"Resume + job description" flow:** Ran analysis → briefly showed "Routing to Matching Agent…" → landed on `/match-report` → confirmed both resume and JD text (character counts) were received correctly.
- Confirmed this satisfies the roadmap's "Together: Test routing hits the correct pipeline for each input case" checkpoint — without needing the real Supervisor endpoint.

---

## Known Quirks / Notes for Next Time

- The routing logic in `Upload.jsx` is a **placeholder**, not the real Supervisor decision — it just reads the client-side `mode` state. This must be swapped out once the backend Supervisor endpoint exists.
- `ATSReport.jsx` and `MatchReport.jsx` currently show placeholder text only ("Phase 4/5 wires in the real Agent here") — this is expected and by design, not a gap. The real score/issues/matched-skills UI is explicitly out of scope for Phase 3 and belongs to Phase 4 (ATS Report UI) and Phase 5 (Match Report UI) respectively.
- Both report pages currently expect only `resumeText`/`jdText` in router state. Once Phase 4/5 wire in real agent calls, the state shape passed on `navigate()` will need to include the agent's structured result (score, issues, etc.), not just raw text.

---