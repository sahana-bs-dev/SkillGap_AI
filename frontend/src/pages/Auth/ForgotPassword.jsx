import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { resetPassword } from "../../api/authApi";
import "./Auth.css";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword({ email, new_password: newPassword });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="split-shell">
      <div className="split-left">
        <div className="brand-mark">✦ SKILLGAP AI</div>
        <h1>Find out exactly where your resume falls short.</h1>
        <p>Drop in a resume and the job you want. Specialist agents score the fit,
          show what already lands, and turn every gap into a plan you can act on
          before you apply.</p>
        <div className="split-features">
          <div className="split-feature"><span className="dot"></span>An explainable match score backed by evidence from your own resume, not a guess.</div>
          <div className="split-feature"><span className="dot"></span>Missing skills ranked by how much they're actually costing you.</div>
          <div className="split-feature"><span className="dot"></span>A week-by-week plan — and a rewrite — to close the gap before you apply.</div>
        </div>
        <div className="split-foot">Built for students and freshers preparing for their first role.</div>
      </div>

      <div className="split-right">
        <div className="split-form">
          {!success ? (
            <>
              <span className="kicker">Reset password</span>
              <h2>Reset your password</h2>
              <p className="lede">Enter your email and choose a new password.</p>

              {error && <div className="form-error">{error}</div>}

              <form onSubmit={handleSubmit}>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email" type="email" required
                    placeholder="you@example.com"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="newPassword">New password</label>
                  <input
                    id="newPassword" type="password" required
                    placeholder="At least 6 characters"
                    value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="confirmPassword">Confirm new password</label>
                  <input
                    id="confirmPassword" type="password" required
                    placeholder="Re-enter new password"
                    value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>

                <button className="auth-submit" type="submit" disabled={submitting}>
                  {submitting ? "Resetting…" : "Reset password"}
                </button>
              </form>
            </>
          ) : (
            <>
              <span className="kicker">Success</span>
              <h2>Password updated</h2>
              <p className="lede">
                Your password has been reset. Redirecting you to log in…
              </p>
            </>
          )}

          <div className="auth-switch">
            <Link to="/login">Back to log in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}