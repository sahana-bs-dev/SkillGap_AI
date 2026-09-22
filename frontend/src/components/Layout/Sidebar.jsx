import { NavLink } from "react-router-dom";
import "./Sidebar.css";
import { useAuth } from "../../context/AuthContext";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/upload", label: "New analysis", step: "01" },
  { to: "/ats-report", label: "ATS report" },
  { to: "/match-report", label: "Match report", step: "02" },
  { to: "/skill-gap", label: "Skill gap", step: "03" },
  { to: "/resume-rewrite", label: "Resume rewrite", step: "05" },
  { to: "/history", label: "History" },
];

function getInitial(user) {
  if (!user?.email) return "?";
  return user.email[0].toUpperCase();
}

export default function Sidebar() {
    const { user } = useAuth(); 
  return (
    <aside className="rail">
      <div className="brand">
        SkillGap AI
      </div>
      <br></br>

      <nav>
        {NAV_ITEMS.map(({ to, label, step }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <span>{label}</span>
            {step && <span className="step">{step}</span>}
          </NavLink>
        ))}
      </nav>
      <div className="rail-foot user-block">
        <div className="avatar">{getInitial(user)}</div>
        <div className="user-email">{user?.email}</div>
      </div>
    </aside>
  );
}