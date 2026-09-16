import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../../context/AuthContext";
import "./Auth.css";

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate("/dashboard");
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
      navigate("/dashboard");
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
          <span className="kicker">Welcome back</span>
          <h2>Log in to your account</h2>
          <p className="lede">Pick up your last analysis or start a new one.</p>

          {error && <div className="form-error">{error}</div>}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email" type="email" required
              placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <div className="password-row">
              <label htmlFor="password">Password</label>
                <Link to="/forgot-password">Forgot password?</Link>
            </div>
            <input
              id="password" type="password" required
              placeholder="••••••••••"
              value={password} onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button className="auth-submit" type="submit" disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </button>

          <div className="auth-divider">or</div>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError("Google sign-in failed. Try again.")}
            />
          </div>

          <div className="auth-switch">
            Don't have an account? <Link to="/signup">Create one</Link>
          </div>
        </form>
      </div>
    </div>
  );
}