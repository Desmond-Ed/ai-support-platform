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

| Method | Path          | Auth | Description                                               |
| ------ | ------------- | ---- | --------------------------------------------------------- |
| GET    | `/api/health` | none | Liveness probe. Returns `{ status, service, timestamp }`. |

### Authentication

| Method | Path                   | Auth                    | Description                                                                           |
| ------ | ---------------------- | ----------------------- | ------------------------------------------------------------------------------------- |
| POST   | `/api/auth/register`   | none                    | Creates a CUSTOMER account and returns a user plus access token; sets refresh cookie. |
| POST   | `/api/auth/login`      | none                    | Validates credentials and returns a user plus access token; sets refresh cookie.      |
| POST   | `/api/auth/refresh`    | refresh cookie          | Rotates the refresh token and returns a new access token.                             |
| POST   | `/api/auth/logout`     | refresh cookie optional | Revokes the current refresh token and clears the cookie.                              |
| POST   | `/api/auth/logout-all` | access JWT              | Revokes all active refresh tokens for the authenticated user.                         |

### Users

| Method | Path            | Auth       | Description                                                                      |
| ------ | --------------- | ---------- | -------------------------------------------------------------------------------- |
| GET    | `/api/users/me` | access JWT | Returns the authenticated user's profile without `passwordHash`.                 |
| PATCH  | `/api/users/me` | access JWT | Updates the authenticated user's display name and returns the sanitized profile. |

### Conversations

| Method | Path                              | Auth       | Description                                                                                          |
| ------ | --------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| GET    | `/api/conversations`              | access JWT | Lists conversations belonging to the authenticated customer, newest activity first.                  |
| POST   | `/api/conversations`              | access JWT | Creates an empty AI-handled conversation for the authenticated customer.                             |
| POST   | `/api/conversations/:id/messages` | access JWT | Validates ownership, persists the customer message, calls the AI service, and persists the AI reply. |

Message creation calls the Python service at `POST /api/chat`. Node persists
the customer message first, then persists the returned AI message with
confidence, groundedness, and escalation metadata. If the AI service is
unavailable, the endpoint returns `503` and the customer message remains
persisted. Validation uses `registerSchema`, `loginSchema`, and
`createMessageSchema`. Errors use the shared `{ error: { message, details? } }`
shape.

### Tickets

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/tickets` | access JWT | Lists tickets belonging to the authenticated customer. |
| POST | `/api/tickets` | access JWT | Creates a ticket for an owned conversation. |
| GET | `/api/tickets/agent` | AGENT or ADMIN JWT | Lists tickets assigned to the authenticated agent. |
| PATCH | `/api/tickets/availability` | AGENT or ADMIN JWT | Updates the authenticated agent's availability. |
| PATCH | `/api/tickets/:id/status` | AGENT or ADMIN JWT | Updates a ticket status. |
| PATCH | `/api/tickets/:id/assign` | AGENT or ADMIN JWT | Assigns an agent to a ticket. |

The current Python chat implementation calls the configured LLM directly.
RAG retrieval and groundedness evaluation remain future additions.

### Notifications

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/notifications` | access JWT | Lists the user's notifications; `?unread=true` filters unread items. |
| PATCH | `/api/notifications/:id/read` | access JWT | Marks one owned notification as read. |
| PATCH | `/api/notifications/read-all` | access JWT | Marks all notifications for the user as read. |

Ticket creation, assignment, and status changes persist notifications and emit
the existing Socket.IO `notification` event.

### Admin and analytics

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/admin/users` | ADMIN | Lists sanitized user records. |
| PATCH | `/api/admin/users/:id` | ADMIN | Updates a user's role or active state. |
| GET | `/api/admin/knowledge` | ADMIN | Lists all knowledge documents and ingestion status. |
| GET | `/api/analytics/overview` | AGENT or ADMIN | Returns ticket, conversation, AI-resolution, notification, and knowledge counts. |

## Future endpoints

- Richer time-series analytics, audit-log views, and full knowledge moderation.
