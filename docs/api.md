# API Documentation

Living document - updated as each phase adds real endpoints. Health and auth
are currently implemented.

## Conventions (established now, applied from Phase 3 onward)

- Base path: `/api`
- Auth: JWT access tokens are returned to the client for the current frontend
  integration; refresh tokens are stored only in an httpOnly cookie. Refresh
  tokens are hashed in the database and rotated on refresh.
- Role enforcement: every non-public route declares its required role(s)
  server-side (`CUSTOMER` / `AGENT` / `ADMIN`). Client-supplied role
  claims are never trusted — role comes from the verified JWT only.
- Errors: `{ "error": { "message": string, "details"?: unknown } }` with
  an appropriate HTTP status code (see `src/middleware/errorHandler.ts`).
- Validation: request bodies/queries validated with Zod in
  `src/validators/` before reaching a controller.

## Endpoints implemented so far

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | none | Liveness probe. Returns `{ status, service, timestamp }`. |

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | none | Creates a CUSTOMER account and returns a user plus access token; sets refresh cookie. |
| POST | `/api/auth/login` | none | Validates credentials and returns a user plus access token; sets refresh cookie. |
| POST | `/api/auth/refresh` | refresh cookie | Rotates the refresh token and returns a new access token. |
| POST | `/api/auth/logout` | refresh cookie optional | Revokes the current refresh token and clears the cookie. |
| POST | `/api/auth/logout-all` | access JWT | Revokes all active refresh tokens for the authenticated user. |

### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/users/me` | access JWT | Returns the authenticated user's profile without `passwordHash`. |

### Conversations

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/conversations` | access JWT | Lists conversations belonging to the authenticated customer, newest activity first. |
| POST | `/api/conversations` | access JWT | Creates an empty AI-handled conversation for the authenticated customer. |
| POST | `/api/conversations/:id/messages` | access JWT | Validates ownership, persists the customer message, calls the AI service, and persists the AI reply. |

Message creation calls the Python service at `POST /api/chat`. Node persists
the customer message first, then persists the returned AI message with
confidence, groundedness, and escalation metadata. If the AI service is
unavailable, the endpoint returns `503` and the customer message remains
persisted. Validation uses `registerSchema`, `loginSchema`, and
`createMessageSchema`. Errors use the shared `{ error: { message, details? } }`
shape.

The current Python chat implementation calls the configured LLM directly.
RAG retrieval and groundedness evaluation remain future additions.

## Endpoints planned (per phase, not yet built)

- Next — Add RAG retrieval and groundedness evaluation to `POST /api/chat`.
- Later — Tickets: `GET/POST /api/tickets`, `PATCH /api/tickets/:id`
- Later — Agent/Admin: agent queue endpoints, `GET /api/knowledge`,
  `POST /api/knowledge`, `GET /api/analytics`
