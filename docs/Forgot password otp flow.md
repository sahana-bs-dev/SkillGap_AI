# Forgot Password — OTP-Based Reset Flow

**Status:** ✅ Complete and verified end-to-end (backend + frontend)

**Scope:** Replace the old single-step "email + new password" reset with a proper 3-step flow: enter email → receive a 6-digit code by email (valid 50 seconds) → verify code → set and confirm a new password.

---

## Tech / Packages Used

| Package | Purpose |
|---|---|
| `sendgrid` | Sends the OTP email via SendGrid's transactional email API |
| `pip-system-certs` | Fixes a Windows SSL certificate verification error (`CERTIFICATE_VERIFY_FAILED`) when calling SendGrid's HTTPS API from Python |

### Removed

- `resend` — originally used for sending the OTP email, replaced with SendGrid because Resend's free test sender (`onboarding@resend.dev`) only allows sending to the account owner's own email, which doesn't work for a multi-user app.

### Install

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

`sendgrid` and `pip-system-certs` are now pinned in `requirements.txt`; `resend` has been removed.

---

## External Service Setup (SendGrid)

1. Created a free SendGrid account (no card required).
2. **Settings → Sender Authentication → Verify a Single Sender** — verified a personal email as the "from" address (no domain ownership needed, unlike Resend's paid-tier requirement). Filled in From Name, From Email, Reply To, and Company Address, then clicked the verification link sent to that inbox.
3. **Settings → API Keys → Create API Key** — generated a Mail Send API key.
4. Free tier: **100 emails/day, ongoing** (no expiry, no recipient allowlist) — enough for a class-project-scale user base.

**Known limitation:** since the sender is a personal Gmail address rather than an authenticated domain, some emails land in the recipient's spam folder (visible as `via sendgrid.net` in the email header). This is expected at this scale and is called out in the UI copy rather than fixed via domain authentication, which was judged unnecessary for a project of this size.

---

## Folder Structure Added / Changed

```
backend/app/
  auth/
    otp_store.py      — NEW: generates and validates OTPs, 50s expiry, in-memory store
    email_utils.py     — NEW: sends the OTP email via SendGrid
    models.py          — CHANGED: added ForgotPasswordRequest, VerifyOtpRequest; ResetPasswordRequest now requires `code`
    routes.py          — CHANGED: old single-step /reset-password replaced with 3 routes
  config.py             — CHANGED: added SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, OTP_VALIDITY_SECONDS

frontend/src/
  api/
    authApi.js          — CHANGED: added forgotPassword(), verifyOtp(); resetPassword() now takes `code`
  pages/Auth/
    ForgotPassword.jsx  — CHANGED: rewritten from 1-step form to a 3-step flow with a live countdown
```

---

## Files Written / Changed and What Each Does

### Backend

- **`app/config.py`** — Added `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL` (both read from `.env`), and `OTP_VALIDITY_SECONDS = 50`.

- **`app/auth/otp_store.py`** *(new)* — In-memory `{email: {code, expires_at}}` store.
  - `generate_otp(email)` — creates a random 6-digit code, stores it with a 50-second expiry, returns the code.
  - `verify_otp(email, code)` — returns `True` only if a code exists for that email, hasn't expired, and matches exactly; deletes expired entries on check.
  - `clear_otp(email)` — removes the entry after a successful password reset, so a used code can't be replayed.
  - Note: this is in-memory, so it resets if the server restarts — acceptable for project scale, would move to Redis or a TTL-indexed Mongo collection for production.

- **`app/auth/email_utils.py`** *(new)* — `send_otp_email(to_email, otp)`. Builds a SendGrid `Mail` object and sends it via `SendGridAPIClient`. Called as a FastAPI `BackgroundTask` so the `/forgot-password` request returns immediately instead of waiting on the email to send.

- **`app/auth/models.py`** — Added `ForgotPasswordRequest` (email only), `VerifyOtpRequest` (email + code). `ResetPasswordRequest` now requires `code` alongside `email`/`new_password`.

- **`app/auth/routes.py`** — Old single-step `/reset-password` route replaced with three routes:
  - `POST /forgot-password` — looks up the user by email (404 if not found), generates an OTP, emails it in the background.
  - `POST /verify-otp` — checks the code against the store; 400 if invalid/expired.
  - `POST /reset-password` — re-verifies the code, hashes and saves the new password, clears the OTP so it can't be reused.

### Frontend

- **`api/authApi.js`** — Added `forgotPassword({ email })` and `verifyOtp({ email, code })`. `resetPassword` now takes `{ email, code, new_password }`.

- **`pages/Auth/ForgotPassword.jsx`** — Rewritten as a 4-state flow (`email` → `otp` → `password` → `success`):
  - **Email step:** collects email, calls `forgotPassword`, moves to OTP step on success.
  - **OTP step:** collects the 6-digit code, shows a live countdown from 50s (`setInterval`), disables the verify button once it hits 0, includes a "Resend code" button that calls `forgotPassword` again and restarts the timer.
  - **Password step:** collects new password + confirmation, validates they match and meet the 6-character minimum, calls `resetPassword` with the stored `code`.
  - **Success step:** confirms the reset, auto-redirects to `/login` after 1.5s.

---

## Endpoints Implemented

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/forgot-password` | Step 1 — send a 6-digit OTP to the user's email |
| `POST` | `/api/auth/verify-otp` | Step 2 — verify the OTP is correct and not expired |
| `POST` | `/api/auth/reset-password` | Step 3 — re-verify the OTP and set the new password |

---

## Testing Done

- `forgot-password` with a registered email → confirmed `200 OK` and the OTP email arrived (spam folder, expected — see limitation above).
- `forgot-password` with an unregistered email → confirmed `404` and no email sent.
- `verify-otp` with the correct code within 50 seconds → confirmed success.
- `verify-otp` with an expired code (waited past 50s) → confirmed `400`.
- `verify-otp` with a wrong code → confirmed `400`.
- `reset-password` with a valid code → confirmed `200 OK` and password updated.
- Reused the same code a second time on `reset-password` → confirmed `400` (proves `clear_otp` works).
- Logged in with the new password → confirmed it took effect.
- Full frontend flow: email → OTP (with visible countdown) → new password + confirm → redirected to login → logged in successfully.

---

## Known Quirks / Notes for Next Time

- OTP storage is in-memory (`otp_store.py`) — fine for one server process during dev/testing, but won't work correctly if the backend ever runs multiple worker processes or restarts mid-flow. Move to Mongo (with a TTL index) or Redis before any real deployment.
- Emails sent via SendGrid using a personal Gmail sender (not an authenticated domain) will often land in spam. The UI tells users to check their spam folder rather than solving this via domain authentication, which was out of scope for this project's size.
- Ran into a Windows-specific `SSL: CERTIFICATE_VERIFY_FAILED` error calling SendGrid's API — fixed by installing `pip-system-certs`, which patches Python's SSL module to trust Windows' certificate store. Worth remembering if the same error reappears on a teammate's machine.
- `python-multipart`, `pdfplumber`, `PyPDF2`, `python-docx` (Phase 2) are unrelated to this change and untouched.

---