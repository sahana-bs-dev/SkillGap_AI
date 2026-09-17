import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../../context/AuthContext";
import "./Auth.css";

export default function Signup() {
  const { signup, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    try {
      await signup({ name, email, password });
      navigate("/upload");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleSuccess(credentialResponse) {
    setError("");
    try {
      await loginWithGoogle(credentialResponse.credential);
      navigate("/upload");
    } catch (err) {
      setError(err.message);
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
        <form className="split-form" onSubmit={handleSubmit}>
          <span className="kicker">Get started</span>
          <h2>Create your account</h2>
          <p className="lede">One account for every analysis, resume version, and re-match.</p>

          {error && <div className="form-error">{error}</div>}

          <div className="field">
            <label htmlFor="name">Full name</label>
            <input
              id="name" type="text" required
              placeholder="Shobitha Rao"
              value={name} onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email" type="email" required
              placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field-row2">
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password" type="password" required
                placeholder="••••••••••"
                value={password} onChange={(e) => setPassword(e.target.value)}
              />
              <div className="field-hint">At least 6 characters</div>
            </div>
            <div className="field">
              <label htmlFor="confirm">Confirm password</label>
              <input
                id="confirm" type="password" required
                placeholder="••••••••••"
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>

          <div className="checkbox-row">
            <input type="checkbox" id="terms" required />
            <label htmlFor="terms">I agree to the <a href="#">Terms</a> and <a href="#">Privacy Policy</a></label>
          </div>

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </button>

          <div className="auth-divider">or</div>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError("Google sign-in failed. Try again.")}
            />
          </div>

          <div className="auth-switch">
            Already have an account? <Link to="/login">Log in</Link>
          </div>
        </form>
      </div>
    </div>
  );
}