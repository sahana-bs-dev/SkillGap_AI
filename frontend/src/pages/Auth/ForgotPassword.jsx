import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { forgotPassword, verifyOtp, resetPassword } from "../../api/authApi";
import "./Auth.css";

const OTP_VALIDITY_SECONDS = 50;

export default function ForgotPassword() {
  const navigate = useNavigate();

  // step: "email" -> "otp" -> "password" -> "success"
  const [step, setStep] = useState("email");

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const timerRef = useRef(null);

  function startCountdown() {
    clearInterval(timerRef.current);
    setSecondsLeft(OTP_VALIDITY_SECONDS);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  // Step 1 — send OTP to email
  async function handleSendCode(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await forgotPassword({ email });
      setStep("otp");
      startCountdown();
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Step 2 — verify OTP
  async function handleVerifyCode(e) {
    e.preventDefault();
    setError("");

    if (secondsLeft === 0) {
      setError("This code has expired. Request a new one.");
      return;
    }

    setSubmitting(true);
    try {
      await verifyOtp({ email, code });
      setStep("password");
    } catch (err) {
      setError(err.message || "Invalid or expired code.");
    } finally {
      setSubmitting(false);
    }
  }

  // Resend OTP from step 2
  async function handleResendCode() {
    setError("");
    setSubmitting(true);
    try {
      await forgotPassword({ email });
      setCode("");
      startCountdown();
    } catch (err) {
      setError(err.message || "Could not resend code. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Step 3 — set new password
  async function handleResetPassword(e) {
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
      await resetPassword({ email, code, new_password: newPassword });
      setStep("success");
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

          {step === "email" && (
            <>
              <span className="kicker">Reset password</span>
              <h2>Reset your password</h2>
              <p className="lede">Enter your email and we'll send you a verification code.</p>

              {error && <div className="form-error">{error}</div>}

              <form onSubmit={handleSendCode}>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email" type="email" required
                    placeholder="you@example.com"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <button className="auth-submit" type="submit" disabled={submitting}>
                  {submitting ? "Sending…" : "Send verification code"}
                </button>
              </form>
            </>
          )}

          {step === "otp" && (
            <>
              <span className="kicker">Verify code</span>
              <h2>Enter verification code</h2>
              <p className="lede">
                We sent a code to <strong>{email}</strong>. Check your spam
                folder if it doesn't arrive within a minute.
              </p>

              {error && <div className="form-error">{error}</div>}

              <form onSubmit={handleVerifyCode}>
                <div className="field">
                  <label htmlFor="code">Verification code</label>
                  <input
                    id="code" type="text" required
                    inputMode="numeric" maxLength={6}
                    placeholder="6-digit code"
                    value={code} onChange={(e) => setCode(e.target.value)}
                  />
                </div>

                <p className="lede" style={{ fontSize: "0.85rem" }}>
                  {secondsLeft > 0
                    ? `Code expires in ${secondsLeft}s`
                    : "Code expired."}
                </p>

                <button
                  className="auth-submit" type="submit"
                  disabled={submitting || secondsLeft === 0}
                >
                  {submitting ? "Verifying…" : "Verify code"}
                </button>

                <button
                  type="button"
                  className="auth-submit"
                  style={{ marginTop: "0.5rem", background: "transparent", color: "inherit", border: "1px solid #ccc" }}
                  onClick={handleResendCode}
                  disabled={submitting}
                >
                  Resend code
                </button>
              </form>
            </>
          )}

          {step === "password" && (
            <>
              <span className="kicker">New password</span>
              <h2>Set a new password</h2>
              <p className="lede">Choose a new password for your account.</p>

              {error && <div className="form-error">{error}</div>}

              <form onSubmit={handleResetPassword}>
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
          )}

          {step === "success" && (
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