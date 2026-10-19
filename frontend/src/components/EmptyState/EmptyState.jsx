import { Link } from "react-router-dom";
import "./EmptyState.css";

// Friendly message shown when a page has nothing to display yet
// (no analysis run, nothing saved, or something went wrong).
// Never put internal details (agent names, raw errors) in here.
//
// Props:
//   title        short heading
//   message      one or two sentences telling the user what to do
//   actionLabel  text on the button (optional)
//   actionTo     route the button links to (optional)
//   onAction     click handler instead of a link, e.g. "Try again" (optional)

export default function EmptyState({ title, message, actionLabel, actionTo, onAction }) {
  let action = null;
  if (actionLabel && actionTo) {
    action = (
      <Link to={actionTo} className="btn empty-state-action">
        {actionLabel}
      </Link>
    );
  } else if (actionLabel && onAction) {
    action = (
      <button type="button" className="empty-state-action" onClick={onAction}>
        {actionLabel}
      </button>
    );
  }

  return (
    <div className="panel empty-state">
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}