# Phase 1 — Backend: Auth + Project Skeleton

**Status:** ✅ Complete and verified end-to-end

**Scope (per roadmap):** FastAPI project structure, MongoDB connection, User model, signup/login routes with JWT.

---

## Tech / Packages Used

| Package | Purpose |
|---|---|
| `fastapi` | Web framework — routing, request/response validation |
| `uvicorn[standard]` | ASGI server that actually runs the FastAPI app |
| `pymongo` | MongoDB driver — connects Python to Atlas |
| `python-dotenv` | Loads variables from `.env` into the app |
| `python-jose[cryptography]` | Creates and verifies JWT tokens |
| `passlib[bcrypt]` | Hashes and verifies user passwords securely |
| `pydantic[email]` | Data validation for request/response schemas, including email format checking |

---

## Database Setup

- Created a MongoDB Atlas cluster named **SkillGap-AI** (AWS, Mumbai region).
- Added a database user and generated a secure password via Atlas's autogenerate option.
- Configured **Network Access** with an IP whitelist entry (`0.0.0.0/0` — allow from anywhere) for local development.
- Verified the connection with a standalone test script that connects, inserts a throwaway document, and deletes it again — confirming both read and write access before building anything on top of it.
- Database name (`skillgap_ai`) is not a fixed/reserved name — MongoDB auto-creates it the first time the app writes data to it.

--- 
## Created a folder structure for backend

---

## Files Written and What Each Does

- **`app/config.py`** — Single source of truth for all environment variables (Mongo URI, DB name, JWT secret, algorithm, token expiry). Everything else imports from here instead of calling `os.getenv()` directly in multiple places.

- **`app/db/mongo_client.py`** — Creates the MongoDB client connection and exposes the collections (`users`, `resumes`, `analyses`) used across the app.

- **`app/auth/models.py`** — Pydantic schemas defining the shape of signup/login requests and responses (`UserSignup`, `UserLogin`, `UserOut`, `TokenResponse`). Acts as the validation layer at the API boundary, separate from how data is actually stored in MongoDB.

- **`app/auth/jwt_handler.py`** — Handles password hashing/verification (bcrypt) and JWT creation/decoding. Also defines the `get_current_user` dependency, which extracts and verifies the token on protected routes, then looks up the corresponding user in MongoDB.

- **`app/auth/routes.py`** — Defines the three auth endpoints: signup, login, and a protected "get current user" route. Signup checks for duplicate emails, hashes the password, and stores the new user. Login verifies credentials and issues a token. The protected route proves the full token → user lookup chain works.

- **`app/main.py`** — The FastAPI app entrypoint. Sets up CORS (so the React frontend on a different port can call the API), registers the auth routes, and defines a basic health-check endpoint at `/`.

- **`.env`** — Holds the real Mongo connection string, database name, and a long random JWT secret key (used to sign and verify tokens — kept out of source control since anyone with it could forge valid tokens).

- **`test_connection.py`** — One-off script to verify the Mongo connection independently, before wiring it into the actual app.

---

## Endpoints Implemented

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/signup` | Create a new user, return a JWT + user info |
| `POST` | `/api/auth/login` | Verify credentials, return a JWT + user info |
| `GET` | `/api/auth/me` | Protected — returns the logged-in user's info based on their token |
| `GET` | `/` | Health check — confirms the server is running |

---

## Testing Done

- Ran the server locally with `uvicorn app.main:app --reload` and confirmed it boots without errors.
- Tested `/api/auth/signup` via Swagger UI (`/docs`) — got a `200` response with a real access token and a MongoDB-generated user `id`.
- Confirmed the new user document actually appeared in the `users` collection in Atlas.
- Tested the protected `/api/auth/me` route using a terminal request with the token attached as an `Authorization: Bearer <token>` header (Swagger's built-in "Authorize" popup didn't work directly with this login flow, so this was the workaround) — got back the correct `id`, `name`, and `email` matching the signed-up user.

---

## Known Quirks / Notes for Next Time

- On Windows PowerShell, `curl` is aliased to `Invoke-WebRequest`, which doesn't accept headers the same way real curl does. Use `curl.exe` to call the actual curl binary, or use PowerShell's native `Invoke-WebRequest -Headers @{...}` syntax instead.
- Since `main.py` lives inside `app/` (per the roadmap's folder structure), the server must be started with `uvicorn app.main:app --reload` — not `uvicorn main:app --reload` — when running from the `backend/` root.
- JWT secret key must stay out of version control; if it leaks, anyone with it could forge valid tokens for any user ID.

---