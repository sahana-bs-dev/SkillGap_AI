// Reusable agent status display, shared across pages — two modes:
//
// 1. Multi-agent strip: pass `agents` — renders one chip per agent.
//    Used on report pages (ATS Report, Match Report, etc.)
//      agents: [{ name, status: 'done' | 'working' | 'idle', label? }]
//
// 2. Single routing indicator: pass `label` + `active` — renders one
//    working chip while a route decision / analysis is in flight.
//    Used on the Upload page while the Supervisor is routing.

export default function AgentStatusIndicator({ agents, label, active }) {
  if (agents) {
    return (
      <div className="agent-strip">
        {agents.map((agent) => (
          <div key={agent.name} className={`agent-chip ${agent.status}`}>
            <span className="dot" />
            {agent.name} — {agent.label ?? defaultLabel(agent.status)}
          </div>
        ))}
      </div>
    );
  }

  if (!active || !label) return null;

  return (
    <div className="agent-chip working" role="status" aria-live="polite">
      <span className="dot" />
      {label}
    </div>
  );
}

function defaultLabel(status) {
  if (status === "done") return "complete";
  if (status === "working") return "running…";
  return "not run";
}