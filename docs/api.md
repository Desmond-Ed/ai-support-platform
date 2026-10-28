# API Documentation

Living document - updated as each phase adds real endpoints. The operational
analytics, audit, and knowledge-moderation surface is implemented alongside the
existing customer, agent, notification, and admin workflows.

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

The AI service (not proxied through the backend) also exposes `/api/health` as
a dependency-free liveness probe and `/api/ready` as a readiness probe. Readiness
returns `200` only when the database is reachable and `OPENAI_API_KEY` is
configured for embeddings; otherwise it returns `503` with a `checks` object.

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

- `GET /api/conversations` — access JWT — Lists conversations belonging to the authenticated customer, newest activity first.
- `POST /api/conversations` — access JWT — Creates an empty AI-handled conversation for the authenticated customer.
- `GET /api/conversations/:id/messages` — access JWT — Returns the latest 200 messages, oldest first; customers must own the conversation, agents must be assigned to it, and admins may access any conversation.
- `POST /api/conversations/:id/messages` — access JWT — Validates ownership, persists the customer message, calls the AI service, and persists the AI reply.
- `POST /api/conversations/:id/handoff` — CUSTOMER access JWT — Escalates an owned conversation to a human agent and returns the conversation. Repeated requests are safe and do not create duplicate tickets; other roles and non-owners receive `404`.
- `POST /api/conversations/:id/agent-messages` — AGENT or ADMIN JWT — Validates role + assignment, persists an agent message, and moves the conversation to `WITH_AGENT`.

Message creation calls the Python service at `POST /api/chat`. Node persists
the customer message first, then persists the returned AI message with
confidence, groundedness, and escalation metadata. If the AI service is
unavailable, the endpoint returns a degraded synchronous result instead of a raw
500: Node persists a system message, sets the conversation to `ESCALATED`,
creates a ticket once, and sends the customer an `AI_HANDOFF` notification.
Validation uses `registerSchema`, `loginSchema`, `createMessageSchema`, and
`createAgentMessageSchema`. Errors use the shared `{ error: { message, details? } }`
shape.

#### Agent reply semantics

- `POST /api/conversations/:id/agent-messages`
- Allowed roles: `AGENT` and `ADMIN`
- Assignment rule: the caller must be the assigned agent for that conversation, or an admin
- Request body: `{ "content": "I can help with this." }`
- Success: `201` with the created agent message payload
- On the first agent reply, the conversation status is moved from `ESCALATED` to `WITH_AGENT`
- Customer receives an `AGENT_REPLIED` notification
- `403` if the user is an unassigned agent, `401` if unauthenticated, `400` on invalid body

### Tickets

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/tickets` | access JWT | Lists tickets belonging to the authenticated customer. |
| POST | `/api/tickets` | access JWT | Creates a ticket for an owned conversation. |
| GET | `/api/tickets/agent` | AGENT or ADMIN JWT | Lists tickets assigned to the authenticated agent. |
| PATCH | `/api/tickets/availability` | AGENT or ADMIN JWT | Updates the authenticated agent's availability. |
| PATCH | `/api/tickets/:id/status` | AGENT or ADMIN JWT | Updates a ticket status. |
| PATCH | `/api/tickets/:id/assign` | AGENT or ADMIN JWT | Assigns an agent to a ticket. |

The Python chat implementation retrieves pgvector knowledge-base context,
calls the configured LLM, and returns groundedness, confidence, and escalation
signals. When retrieval is unavailable or no context matches, it degrades to an
explicit ungrounded reply that recommends a human agent.

### Notifications

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/notifications` | access JWT | Lists the user's notifications; `?unread=true` filters unread items. |
| PATCH | `/api/notifications/:id/read` | access JWT | Marks one owned notification as read. |
| PATCH | `/api/notifications/read-all` | access JWT | Marks all notifications for the user as read. |

Ticket creation, assignment, and status changes persist notifications and emit
the existing Socket.IO `notification` event.

### Admin and analytics

All `/api/admin/*` routes require an `ADMIN` access token. Analytics routes
require `AGENT` or `ADMIN`. Client-supplied roles are ignored.

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/api/admin/users` | ADMIN | Lists sanitized user records; never includes `passwordHash`. |
| PATCH | `/api/admin/users/:id` | ADMIN | Updates role or active state. No-op updates do not create audits; effective changes create `USER_UPDATED`. |
| GET | `/api/admin/knowledge` | ADMIN | Paginated moderation queue. Filters: `status`, `moderationStatus`, `search`, `page`, `pageSize`. |
| GET | `/api/admin/knowledge/:id` | ADMIN | Returns one knowledge document with uploader, moderator, and moderation/retry state. |
| PATCH | `/api/admin/knowledge/:id/moderation` | ADMIN | Applies `APPROVE`, `REJECT`, `ARCHIVE`, or `RESTORE` using `expectedVersion`. |
| POST | `/api/admin/knowledge/:id/retry` | ADMIN | Retries failed ingestion, claims the job, and returns `202` with a unique retry job ID. |
| GET | `/api/admin/audit-logs` | ADMIN | Paginated audit history. Filters: `action`, `actorId`, `entityType`, `entityId`, `from`, `to`, `page`, `pageSize`. |
| GET | `/api/analytics/overview` | AGENT or ADMIN | Returns ticket, conversation, AI-resolution, notification, and knowledge counts. |
| GET | `/api/analytics/timeseries` | AGENT or ADMIN | Returns inclusive UTC daily series and a summary for `from`/`to` (`YYYY-MM-DD`, maximum 90 days). |

#### Knowledge moderation contract

Moderation is Node-owned and versioned with `moderationVersion`; a stale
`expectedVersion` returns `409` without changing state. `APPROVE` requires
ingestion `status = READY`. `REJECT` requires a bounded `reason` and stores it.
`ARCHIVE` removes an approved document from retrieval; `RESTORE` returns it to
review without publishing it. Failed ingestion can be retried only from
`FAILED`; a current BullMQ job causes `409`, and enqueue failure restores
`FAILED` and records a failure audit. Knowledge content and source type are
immutable in this phase; a revision is a new document.

Retrieval publication requires both `status = READY` and
`moderationStatus = APPROVED`. Audit metadata is allowlisted and never includes
document content, credentials, or tokens.

The current audit action set is:

- `USER_UPDATED`
- `TICKET_ASSIGNED`
- `TICKET_STATUS_CHANGED`
- `KNOWLEDGE_SUBMITTED`
- `KNOWLEDGE_APPROVED`
- `KNOWLEDGE_REJECTED`
- `KNOWLEDGE_ARCHIVED`
- `KNOWLEDGE_RESTORED`
- `KNOWLEDGE_INGESTION_RETRY_REQUESTED`
- `KNOWLEDGE_INGESTION_RETRY_ENQUEUE_FAILED`

Ticket status transitions persist `resolvedAt` as follows: `RESOLVED` sets it,
`CLOSED` retains it, reopening (`OPEN` or `IN_PROGRESS`) clears it, and
re-resolution sets a new timestamp. The analytics average-resolution metric is
computed only from persisted resolution timestamps.
