import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import "./Sidebar.css";
import { useAuth } from "../../context/AuthContext";

// Where to go after logging out. Change this if your login route is different.
const LOGIN_PATH = "/login";

// Sidebar sizes in pixels. Change these to adjust how small or large it can get.
const DEFAULT_WIDTH = 220;
const MIN_WIDTH = 180;
const MAX_WIDTH = 400;
const COLLAPSED_WIDTH = 56;

// Screens this narrow get the top bar + bottom tab bar instead of the side rail.
// Keep this in sync with the @media rule in Sidebar.css.
const MOBILE_QUERY = "(max-width: 768px)";

// The open/closed state and the width are remembered between pages and visits.
const WIDTH_KEY = "sidebar_width";
const COLLAPSED_KEY = "sidebar_collapsed";

function readWidth() {
  try {
    const saved = Number(localStorage.getItem(WIDTH_KEY));
    if (saved >= MIN_WIDTH && saved <= MAX_WIDTH) return saved;
  } catch {
    // storage blocked: use the default
  }
  return DEFAULT_WIDTH;
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function readMobile() {
  try {
    return window.matchMedia(MOBILE_QUERY).matches;
  } catch {
    return false;
  }
}

function clamp(value) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, value));
}

function getInitial(user) {
  if (!user?.email) return "?";
  return user.email[0].toUpperCase();
}

// Door-with-arrow icon, drawn in the button's text color.
function LogoutIcon() {
  return (
    <svg
      className="logout-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// Small icons for the bottom tab bar, drawn in the tab's text color.
function TabIcon({ name }) {
  let shapes = null;
  if (name === "home") {
    shapes = (
      <>
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </>
    );
  } else if (name === "new") {
    shapes = (
      <>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </>
    );
  } else if (name === "match") {
    shapes = (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
      </>
    );
  } else if (name === "gap") {
    shapes = (
      <>
        <line x1="6" y1="20" x2="6" y2="12" />
        <line x1="12" y1="20" x2="12" y2="5" />
        <line x1="18" y1="20" x2="18" y2="9" />
      </>
    );
  } else {
    shapes = (
      <>
        <circle cx="5" cy="12" r="1.6" fill="currentColor" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        <circle cx="19" cy="12" r="1.6" fill="currentColor" />
      </>
    );
  }

  return (
    <svg
      className="tab-icon"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes}
    </svg>
  );
}

// Pages that live inside the "More" sheet on phones.
const MORE_PATHS = ["/ats-report", "/resume-rewrite", "/improvement-loop", "/history", "/compare"];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const [width, setWidth] = useState(readWidth);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [dragging, setDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(readMobile);
  const [moreOpen, setMoreOpen] = useState(false);
  const railRef = useRef(null);

  // Track the screen size so the sidebar switches layout when the window changes.
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    function onChange(e) {
      setIsMobile(e.matches);
    }
    setIsMobile(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // The page layout (.shell in Sidebar.css) reads this variable for its first column.
  useLayoutEffect(() => {
    const current = collapsed ? COLLAPSED_WIDTH : width;
    document.documentElement.style.setProperty("--rail-width", current + "px");
  }, [width, collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // storage blocked: the sidebar still works, it just will not be remembered
    }
  }, [width, collapsed]);

  // Close the "More" sheet after moving to another page.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Close the sheet if the screen grows back to desktop size.
  useEffect(() => {
    if (!isMobile) setMoreOpen(false);
  }, [isMobile]);

  // Stop the page behind the open sheet from scrolling.
  useEffect(() => {
    if (!(isMobile && moreOpen)) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isMobile, moreOpen]);

  function handleLogout() {
    if (typeof logout === "function") {
      // your AuthContext's own logout (clears the user and the saved token)
      logout();
    } else {
      // fallback if AuthContext does not provide logout(): clear the saved token
      try {
        localStorage.removeItem("token");
        localStorage.removeItem("access_token");
      } catch {
        // storage blocked
      }
    }
    navigate(LOGIN_PATH, { replace: true });
  }

  function startDrag(e) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  function onDrag(e) {
    if (!dragging || !railRef.current) return;
    const left = railRef.current.getBoundingClientRect().left;
    setWidth(clamp(Math.round(e.clientX - left)));
  }

  function endDrag(e) {
    if (!dragging) return;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
  }

  // Keyboard resizing: left/right arrows change the width, Home resets it.
  function onResizeKey(e) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setWidth((w) => clamp(w - 16));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setWidth((w) => clamp(w + 16));
    } else if (e.key === "Home") {
      e.preventDefault();
      setWidth(DEFAULT_WIDTH);
    }
  }

  // One sidebar link. `activeOn`: highlight on that path instead of its own `to`.
  // Compare has no page of its own to open (it needs two chosen items), so its
  // link goes to History, where the items are picked, and it only lights up
  // while a comparison is actually open.
  function navLink(to, label, step, activeOn) {
    return (
      <NavLink
        to={to}
        className={({ isActive }) => {
          const active = activeOn ? pathname.startsWith(activeOn) : isActive;
          return active ? "active" : "";
        }}
      >
        <span>{label}</span>
        {step && <span className="step">{step}</span>}
      </NavLink>
    );
  }

  /* ---------- phones: top bar + bottom tab bar + "More" sheet ---------- */

  if (isMobile) {
    let moreActive = false;
    for (let i = 0; i < MORE_PATHS.length; i++) {
      if (pathname.startsWith(MORE_PATHS[i])) moreActive = true;
    }

    // One tab in the bottom bar.
    const tabLink = (to, label, icon) => (
      <NavLink to={to} className={({ isActive }) => (isActive ? "active" : "")}>
        <TabIcon name={icon} />
        <span>{label}</span>
      </NavLink>
    );

    // One link inside the "More" sheet.
    const sheetLink = (to, label, activeOn) => (
      <NavLink
        to={to}
        className={({ isActive }) => {
          const active = activeOn ? pathname.startsWith(activeOn) : isActive;
          return active ? "active" : "";
        }}
      >
        {label}
      </NavLink>
    );

    return (
      <>
        <header className="mobile-top">
          <div className="brand">SkillGap AI</div>
        </header>

        {moreOpen && (
          <>
            <div className="mobile-backdrop" onClick={() => setMoreOpen(false)} />
            <div className="mobile-sheet" role="dialog" aria-label="More pages">
              <div className="mobile-sheet-links">
                {sheetLink("/ats-report", "ATS report")}
                {sheetLink("/resume-rewrite", "Resume rewrite")}
                {sheetLink("/improvement-loop", "Improvement loop")}
                {sheetLink("/history", "History")}
                {sheetLink("/history", "Compare", "/compare")}
              </div>

              <div className="mobile-sheet-foot">
                <div className="user-block">
                  <div className="avatar">{getInitial(user)}</div>
                  <div className="user-email">{user?.email}</div>
                </div>
                <button
                  type="button"
                  className="rail-logout"
                  onClick={handleLogout}
                  aria-label="Log out"
                >
                  <LogoutIcon />
                  <span>Log out</span>
                </button>
              </div>
            </div>
          </>
        )}

        <nav className="mobile-tabs" aria-label="Main">
          {tabLink("/dashboard", "Home", "home")}
          {tabLink("/upload", "New", "new")}
          {tabLink("/match-report", "Match", "match")}
          {tabLink("/skill-gap", "Skill gap", "gap")}
          <button
            type="button"
            className={moreActive || moreOpen ? "active" : ""}
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            aria-label="More pages"
          >
            <TabIcon name="more" />
            <span>More</span>
          </button>
        </nav>
      </>
    );
  }

  /* ---------- desktop: the side rail ---------- */

  const railClass = "rail" + (collapsed ? " collapsed" : "") + (dragging ? " resizing" : "");

  return (
    <aside ref={railRef} className={railClass}>
      <div className="rail-top">
        {!collapsed && <div className="brand">SkillGap AI</div>}
        <button
          type="button"
          className="rail-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Open sidebar" : "Close sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Open sidebar" : "Close sidebar"}
        >
          {collapsed ? "»" : "«"}
        </button>
      </div>

      {!collapsed && (
        <nav>
          {navLink("/dashboard", "Dashboard")}
          {navLink("/upload", "New analysis", "01")}
          {navLink("/ats-report", "ATS report")}
          {navLink("/match-report", "Match report", "02")}
          {navLink("/skill-gap", "Skill gap", "03")}
          {navLink("/resume-rewrite", "Resume rewrite", "05")}
          {navLink("/improvement-loop", "Improvement loop", "06")}
          {navLink("/history", "History")}
          {navLink("/history", "Compare", undefined, "/compare")}
        </nav>
      )}

      <div className="rail-foot">
        <div className="user-block">
          <div className="avatar" title={collapsed ? user?.email : undefined}>
            {getInitial(user)}
          </div>
          {!collapsed && <div className="user-email">{user?.email}</div>}
        </div>

        <button
          type="button"
          className="rail-logout"
          onClick={handleLogout}
          aria-label="Log out"
          title="Log out"
        >
          <LogoutIcon />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>

      {!collapsed && (
        <div
          className="rail-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuenow={width}
          aria-valuemin={MIN_WIDTH}
          aria-valuemax={MAX_WIDTH}
          tabIndex={0}
          title="Drag to resize. Double-click to reset."
          onPointerDown={startDrag}
          onPointerMove={onDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={() => setWidth(DEFAULT_WIDTH)}
          onKeyDown={onResizeKey}
        />
      )}
    </aside>
  );
}