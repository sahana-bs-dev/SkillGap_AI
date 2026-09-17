import "./AgentStatusIndicator.css";

/**
 * Reusable status pill shown while an agent is "running".
 * Used across pages (Upload, ATS report, Match report, etc.) per the blueprint.
 */
export default function AgentStatusIndicator({ label, active = true }) {
  if (!active || !label) return null;

  return (
    <div className="agent-status">
      <span className="agent-status-dot" />
      <span className="agent-status-label">{label}</span>
    </div>
  );
}