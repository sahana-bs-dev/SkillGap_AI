# Phase 1 — Frontend: Auth Pages + Password Reset

**Status:** ✅ Complete and verified end-to-end

**Scope (per roadmap):** React (Vite) project structure, Login/Signup pages, protected routing, session persistence, and a combined forgot/reset-password flow wired to the backend.

---

## Tech / Packages Used

| Package | Purpose |
|---|---|
| `react`, `react-dom` | Core UI library |
| `react-router-dom` | Client-side routing (`/login`, `/signup`, `/forgot-password`, `/dashboard`) |
| `vite` | Dev server + build tool |
| `@vitejs/plugin-react` | Vite's React plugin (JSX, fast refresh) |
| `eslint` + `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` | Linting |

### Install

`frontend/node_modules` is **not** committed to git (correctly ignored). After pulling this branch, run:

```powershell
cd frontend
npm install
```

That installs everything listed in `package.json` — no manual package-by-package install needed.

---

## Backend dependency change — action required

The backend's `passlib[bcrypt]` setup had a version incompatibility with newer `bcrypt` releases (passlib expects an attribute newer bcrypt versions removed, causing a crash on password hashing). This required pinning the `bcrypt` version in `backend/requirements.txt`.

**After pulling this branch, also re-run the backend install:**

```powershell
cd backend
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt --upgrade
```

If signup/login start throwing a `bcrypt`/`AttributeError` locally, this is the fix — reinstall with the command above rather than debugging it fresh.

---

## Folder Structure Added

```
frontend/src/
  api/
    apiClient.js       — shared fetch wrapper (base URL, auth header, error handling)
    authApi.js          — signup / login / getMe / resetPassword calls
  components/
    ProtectedRoute.jsx  — redirects to /login if no authenticated user
  context/
    AuthContext.jsx      — global auth state (user, token, login/signup/logout)
  pages/
    Auth/
      Login.jsx
      Signup.jsx
      ForgotPassword.jsx — combined email + new password + confirm (single step)
      Auth.css
    Dashboard/
      Dashboard.jsx
  App.jsx                — route definitions
  main.jsx
```

---

## Files Written and What Each Does

- **`api/apiClient.js`** — Central `apiRequest()` wrapper around `fetch`. Attaches the JWT from `localStorage` as a Bearer token automatically, sets JSON headers, and normalizes error handling (throws with the backend's `detail` message on non-2xx responses; also handles 401 by calling a global unauthorized handler).

- **`api/authApi.js`** — Thin functions per endpoint: `signup`, `login`, `getMe`, and `resetPassword`. Nothing else in the app calls `fetch` directly — it all goes through here.

- **`context/AuthContext.jsx`** — Wraps the app, holds `user`/`token`/`loading` state. On load, if a token exists in `localStorage`, it calls `/me` to verify it's still valid before treating the user as logged in. Exposes `login`, `signup`, and `logout`.

- **`components/ProtectedRoute.jsx`** — Wraps `/dashboard`. Redirects to `/login` if there's no authenticated user once the initial session check finishes.

- **`pages/Auth/Login.jsx`** / **`Signup.jsx`** — Standard forms calling `useAuth()`'s `login`/`signup`, redirecting to `/dashboard` on success.

- **`pages/Auth/ForgotPassword.jsx`** — Originally a two-step flow (`ForgotPassword` → email a link → separate `ResetPassword` page with a token). Simplified to a **single page, single step**: email + new password + confirm, submitted directly to `POST /api/auth/reset-password`. The old `ResetPassword.jsx` page and its route were removed since there's no token/email-link step in this version.

- **`App.jsx`** — Route table. `/reset-password` route and its import were removed along with the file.

---

## Endpoints Called From Frontend

| Method | Path | Called from |
|---|---|---|
| `POST` | `/api/auth/signup` | `Signup.jsx` via `AuthContext.signup` |
| `POST` | `/api/auth/login` | `Login.jsx` via `AuthContext.login` |
| `GET` | `/api/auth/me` | `AuthContext` on app load (session restore) |
| `POST` | `/api/auth/reset-password` | `ForgotPassword.jsx` |

---

## Testing Done

- Ran `npm run dev`, confirmed the app boots and all routes render.
- Signup → redirected to dashboard, token persisted in `localStorage`.
- Logout → cleared token, redirected to `/login`.
- Refreshed the page while logged in → session restored via `/me` without re-login.
- Forgot-password flow: entered an existing email + new password + confirm → success message → redirected to `/login` after ~1.5s → logged in successfully with the new password.
- Forgot-password flow with a non-existent email → inline error shown (backend's 404 message), no crash.
- Mismatched password/confirm → caught client-side before hitting the API.

---

## Known Quirks / Notes for Next Time

- `bcrypt` version pin on the backend — see the "action required" section above. If you skip `pip install -r requirements.txt --upgrade` after pulling, signup/login/reset-password will fail with a bcrypt-related error even though the code itself is unchanged.
- `frontend/node_modules` and `frontend/dist` are gitignored — always run `npm install` after pulling, don't expect `node_modules` to come from git.
- The reset-password flow currently has **no identity verification** (no email link, no OTP) — anyone who knows an account's email can reset its password. Acceptable for this project's current scope, but worth revisiting if auth ever needs to be hardened.

---