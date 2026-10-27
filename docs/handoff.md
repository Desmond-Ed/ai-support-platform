# Engineering Handoff

## Current state

The active project is `C:\Users\USER\Documents\ai-support-platform`, branch
`phase5-chat-ui`. The customer-to-agent workflow plus operational analytics,
audit visibility, and knowledge moderation are implemented and verified locally,
including database-backed integration tests, browser E2E coverage, and CI job
definitions.

- Backend: Node.js/Express/TypeScript under `backend/`, API prefix `/api`.
- Frontend: React/Vite under `frontend/`.
- AI service: Python/FastAPI under `ai-service/`.
- Development Compose stack: frontend `5173`, backend `4000`, AI `8000`,
  PostgreSQL `5432`, Redis `6380`.
- Isolated E2E Compose stack: frontend `5174`, backend `4001`, AI `8001`,
  PostgreSQL `5433`, Redis `6381`.

Do not use the development database for E2E runs, and do not reset its volumes.

## Validate code

```powershell
cd C:\Users\USER\Documents\ai-support-platform\backend
npm test
npm run test:integration   # requires isolated PostgreSQL on localhost:5433
npm run build
npm run lint

cd ..\frontend
npm run build
npm run lint

cd ..\ai-service
..\.venv\Scripts\python.exe -m pytest -q
..\.venv\Scripts\python.exe -m ruff check .
```

## Run the isolated E2E stack

```powershell
cd C:\Users\USER\Documents\ai-support-platform
docker compose -f docker-compose.e2e.yml up -d --build --wait
docker compose -f docker-compose.e2e.yml exec -T backend npx prisma migrate deploy
docker compose -f docker-compose.e2e.yml exec -T backend npm run db:seed:e2e

cd e2e
npm test
```

From `e2e/`, `npm run test:ci` performs the same sequence. Tear down with
`npm run stack:down`. The AI service points at a deterministic local stub; no
paid provider credentials are needed.

## E2E architecture

- Specs live in `e2e/*.spec.ts`; shared helpers live in `e2e/support/`.
- `global-setup.ts` waits for backend health, waits for a unique refund fixture
  to ingest, then approves it through the moderation API before chat tests.
- The deterministic stub returns token-aware lexical embeddings. Its control
  endpoint (`http://localhost:8082/control/fail-embeddings`) fails an exact
  embedding input count; the retry test uses a 13-chunk document so concurrent
  chat embedding does not fail. `operations.spec.ts` is serial within its file.
- Login helpers wait for `data-testid="app-shell"`, a matching
  `data-authenticated`/`data-role`, and a confirmed `/api/users/me` session
  before reloading. Do not replace this with fixed sleeps.
- Realtime readiness uses `data-socket-connected`; customer chat readiness uses
  `data-loaded` and `data-subscribed`.
- Unique customers are created per test; shared mutable notification state is
  avoided. Dynamic agents are registered then promoted by an admin.
- `SIMULATE_AI_OUTAGE` makes the stub return HTTP 500 so the suite verifies the
  persisted degraded escalation rather than a fake AI reply.
- Prisma 7 uses the repository-root `backend/prisma.config.ts` with
  `import 'dotenv/config'`. Migration commands must run where that config is
  discoverable (the backend working directory/container).

## Important implementation notes

- Refresh tokens are stored as SHA-256 hashes; rotation uses a conditional
  revoke so concurrent requests cannot rotate one token twice.
- Registration never accepts a role and creates CUSTOMER accounts.
- Access-token roles are stateless and can remain stale until expiry.
- Knowledge document creation persists PENDING before enqueueing ingestion with
  a deterministic job ID and writes a submission audit. If initial enqueue fails,
  the document is marked `FAILED` only while it is still `PENDING` at ingestion
  attempt `0`, and the failure audit is written only when that conditional state
  update applies.
- Retrieval requires `status = READY AND moderationStatus = APPROVED`.
  Moderation is Node-owned and uses `moderationVersion`; approval requires ready
  ingestion, reject requires a reason, archive removes retrieval access, and
  restore returns to review.
- Retry is only valid from `FAILED`; Node checks BullMQ state, claims the
  document, increments `ingestionAttempt`, enqueues a unique retry job, and
  restores `FAILED` on enqueue failure. Python never writes moderation/audit.
- Ticket assignment and status transitions lock the ticket row, treat duplicate
  same-target requests as no-ops, and serialize competing changes. Concurrent
  different-agent assignments and competing status changes produce contiguous
  audit chains; forced audit failures roll back assignment, ticket, and
  conversation state.
- Express 5 makes `req.query` a getter. `validateQuery` replaces it with
  `Object.defineProperty`; do not mutate it directly.
- Audit metadata is allowlisted and scalar/type-validated. Content, credentials,
  and tokens must never be added to audit metadata.
- Admin date filters keep draft inputs separate from applied ranges: audit dates
  apply via Apply dates/Clear dates, analytics presets apply immediately, and
  analytics Apply re-applies the draft range (including a reload when unchanged).
- Escalation is Node-owned. `ensureEscalation` creates one ticket and, when
  requested, one SYSTEM handoff message. Repeated handoffs do not duplicate
  either. The degraded and AI-escalation paths add the handoff message; manual
  handoff does too; state-only escalation does not.
- The refresh cookie path is `/api/auth`.
- Docker and local development must not both bind the same host port.

## Validation status

- Backend: 70 Vitest tests, TypeScript build, and ESLint pass.
- Backend integration: 11 DB-backed tests pass against the isolated E2E
  PostgreSQL.
- AI service: 15 pytest tests pass, 1 opt-in DB test is skipped in the default
  run; the DB-backed retrieval test passed separately. Ruff passes.
- Frontend: TypeScript/Vite build and ESLint pass.
- E2E: the latest 37 Playwright tests pass with 4 workers after the audit fixes.
  Earlier repeatability evidence from before those fixes was 74/74 with
  `--repeat-each=2`; that run does not cover the subsequent fixes.
- Migration: all migrations apply cleanly to a fresh database; the moderation
  migration applies over a legacy READY document, preserving content and setting
  moderation defaults.
- The two bounded follow-up tasks (initial enqueue-failure guard and ticket
  transaction integration tests) passed Astra audit. This is not full-phase
  independent audit approval.
- GitHub Actions now has frontend/backend/AI/E2E and service-backed backend
  integration jobs, but hosted CI remains unverified for the latest changes and
  deployment has not completed.
- Remaining hardening: hosted deployment secrets, external tracing, durable cost
  aggregation, and optional abandoned-ingestion reconciliation.
