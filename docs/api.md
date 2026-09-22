# API Documentation

Living document — updated as each phase adds real endpoints. Empty in
Phase 1 because no application endpoints exist yet beyond health checks.

## Conventions (established now, applied from Phase 3 onward)

- Base path: `/api`
- Auth: JWT access token via httpOnly cookie; refresh token via separate
  httpOnly cookie. No tokens in localStorage/sessionStorage or response
  bodies.
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

## Endpoints planned (per phase, not yet built)

- Phase 3 — Auth: `POST /api/auth/register`, `POST /api/auth/login`,
  `POST /api/auth/refresh`, `POST /api/auth/logout`
- Phase 4 — Conversations: `GET/POST /api/conversations`,
  `POST /api/conversations/:id/messages`
- Phase 6/7 — Chat/RAG: `POST /api/chat`
- Phase 8 — Tickets: `GET/POST /api/tickets`, `PATCH /api/tickets/:id`
- Phase 9/10 — Agent/Admin: agent queue endpoints, `GET /api/knowledge`,
  `POST /api/knowledge`, `GET /api/analytics`
