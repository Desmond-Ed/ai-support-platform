# Project Plan

## Completed

### Foundation

- Monorepo layout for frontend, backend, AI service, knowledge base, Docker,
  and end-to-end testing.
- Docker Compose services for PostgreSQL/pgvector, Redis, backend, AI service,
  and frontend.
- Prisma schema, initial migration, generated client, repositories, config,
  logging, error handling, and health endpoints.

### Authentication

- Register and login validation with Zod.
- CUSTOMER-only self-registration.
- bcrypt password hashing and timing-safe login failure behavior.
- Signed access JWTs and refresh JWTs.
- httpOnly refresh cookie with environment-aware secure flag.
- Hashed refresh-token persistence, rotation, logout, and logout-all.
- Auth middleware and role guard.
- Docker smoke test verified login, refresh, logout, and post-logout `401`.
- Conditional refresh-token revocation prevents concurrent double rotation.
- Vitest coverage for registration, generic login failure, refresh rotation,
  concurrent refresh rejection, token reuse, logout, logout-all, and role
  middleware.
- Authenticated `GET /api/users/me` profile route with password-hash
   sanitization and service tests.
- Authenticated `PATCH /api/users/me` profile-name update with validation,
  password-hash sanitization, and missing-user service tests.
- Profile update controller authorization tests cover unauthenticated requests
   and authenticated-subject enforcement.
- Socket.IO connections authenticate with access JWTs, join private user rooms,
  and expose typed ticket, assignment, and notification emitters with tests.
- Customer-scoped conversation list/create endpoints with repository/service
   tests.
- Customer-owned message persistence with validation and ownership tests;
   AI response generation through Python `/api/chat`, including persisted AI
   messages and a `503` degraded path.
- AI escalation and handoff flow is Node-owned: `shouldEscalate` results and
   AI-service outages set conversations to `ESCALATED`, create a single ticket
   once, persist a system handoff message, and notify the customer plus available
   AGENT users.
- Agent reply route for `AGENT`/`ADMIN` users is implemented and tested: first
   agent reply moves the conversation to `WITH_AGENT`, persists the agent message,
   and sends `AGENT_REPLIED` to the customer.
- Ticket resolution now updates conversation state and sends `TICKET_RESOLVED`
   notifications when a ticket is marked resolved.

### Knowledge base / RAG foundation

- `KnowledgeDocument`, `KnowledgeChunk`, and `Embedding` models are present in
  Prisma and scoped to the Python-owned knowledge-base layer.
- Backend repository + service support for pending knowledge-document creation
  and uploader listing.
- `/api/knowledge` routes are mounted for authenticated listing and creation.
- AI chat route retrieves relevant knowledge-context and evaluates groundedness
  before returning a response and escalation signal.
- Knowledge documents are queued for asynchronous ingestion with stable job IDs;
   the Python service performs bounded paragraph-aware chunking with focused
   ingestion tests.
- Knowledge ingestion generates validated 1536-dimensional provider embeddings,
   persists them to pgvector, and query retrieval uses vector similarity with a
   conservative degraded path.
- Socket.IO resource subscriptions now verify conversation ownership or ticket
   customer/assignment access, and the frontend has a reusable authenticated
   client plus realtime event hook.
- Agent availability is exposed through a validated, role-protected endpoint
   using the authenticated agent identity.

## Completed next-phase work

- Notifications are persisted, listed, marked read, and emitted over Socket.IO
   for ticket creation, assignment, and status changes.
- Admin user/knowledge workflows and role-protected analytics overview are
   implemented.
- Frontend operations dashboard supports email/password login, customer ticket
   creation and history, agent/admin assigned queues, assign-to-self, ticket
   status updates, notifications, and analytics summaries.
- Playwright smoke-test project and production Docker Compose override exist.
- AI responses expose token usage and estimated cost, with structured usage
   logging.

### Operational analytics, audit visibility, and knowledge moderation

- Admin knowledge moderation queue/detail APIs with status/search filters,
  pagination, optimistic `moderationVersion`, approval readiness checks, bounded
  rejection reasons, archive, and restore.
- Moderation writes and matching audits share one transaction; stale versions
  and invalid transitions return `409` without mutation or audit.
- Ticket assignment and status transitions lock the ticket row, treat duplicate
  same-target requests as no-ops, and serialize competing changes. Concurrent
  different-agent assignments and competing status changes produce contiguous
  audit chains; forced audit failures roll back assignment, ticket, and
  conversation state.
- Failed-ingestion retry is Node-owned, queue-aware, claims the document,
  increments attempts, uses a unique retry job ID, and restores `FAILED` if
  enqueueing fails.
- Initial ingestion enqueue failure is persisted only while the document is
  still `PENDING` at ingestion attempt `0`; the failure audit is written only
  when that conditional update applies, so newer states or attempts are not
  overwritten.
- Knowledge submission, moderation, retry, ticket assignment/status, and admin
  user updates now create allowlisted, scalar/type-validated audit records.
  Audit reads support actor/entity/action/date filters and pagination.
- Ticket `resolvedAt` is set on resolution, retained on close, cleared on reopen,
  and reset on re-resolution; the index supports resolution analytics.
- Time-series analytics returns inclusive UTC days, zero-filled series, summary
  totals, and average resolution time.
- Frontend operations dashboard adds time-series charts/table, knowledge
  moderation controls, and audit-log filtering while preserving customer/agent
  flows.
- Admin date filters keep draft inputs separate from applied ranges: audit dates
  apply via Apply dates/Clear dates, analytics presets apply immediately, and
  analytics Apply re-applies the draft range (including a reload when unchanged).
- Python retrieval now requires both ingestion `READY` and moderation
  `APPROVED`, with both mocked and database-backed coverage.
- Database-backed integration tests cover concurrent moderation, audit rollback,
  approval readiness, stale versions, ticket assignment/status concurrency,
  ticket resolution timestamps, admin-user audit/no-op behavior, and analytics
  aggregation.
- Clean and forward migration paths were verified; the isolated E2E stack now
  covers moderation, retry recovery, role restrictions, audit filtering, and the
  new admin UI.

### E2E reliability and CI

- Isolated `docker-compose.e2e.yml` stack with dedicated containers, volumes,
  database, network, and host ports (`5174`, `4001`, `8001`, `5433`, `6381`).
- Deterministic OpenAI-compatible stub for embeddings and chat, including a
  provider-outage mode that exercises the real degraded-escalation path.
- Seeded E2E identities plus API-driven unique customers and agents for parallel
  test isolation.
- Confirmed-session login/reload helpers replace fixed sleeps, removing the
  parallel-load localStorage race.
- Full browser coverage for auth, authorization, ticket persistence/assignment,
  grounded chat, idempotent handoff, provider outage, realtime replies,
  resolution and assignment notifications, mark-all-read, and analytics.
- Idempotent handoff now persists a single SYSTEM handoff message without
  duplicating it in the degraded path; backend unit coverage asserts it.
- GitHub Actions E2E job builds the isolated stack, applies committed
  migrations, seeds identities, runs Playwright, uploads artifacts, and always
  tears down.

### Deployment hardening

- Free-tier target documented in `docs/deployment.md`: Vercel frontend, Render
  free Docker services for backend/AI, Neon Postgres/pgvector, and flat-rate
  Redis with `noeviction`.
- AI chat provider is configurable for OpenAI, DeepSeek direct
  (`deepseek-flash`), or an OpenAI-compatible endpoint such as NVIDIA Build.
  Embeddings default to Gemini `gemini-embedding-001`; OpenAI
  `text-embedding-3-small` remains supported, both at 1536 dimensions.
- AI HTTP 429s and transient provider 5xx/529s retry with exponential backoff
  and return a clean `503` when exhausted. The AI service adds `/api/ready` for
  database, pgvector, and provider-config readiness while `/api/health` remains
  dependency-free.
- Production seeding requires explicit `SEED_ADMIN_EMAIL` and
  `SEED_ADMIN_PASSWORD` and does not create known development accounts.
- Production Docker port binding uses Render's `PORT`; Neon pooled/direct URLs
  are separated through `DATABASE_URL` and `DATABASE_URL_UNPOOLED`; deployed
  CORS origins are environment-driven.
- BullMQ ingestion now uses 4 attempts with exponential backoff, communicates
  attempt state to Python, writes `FAILED` only on the final attempt, and
  reconciles a still-unfinished document if the final HTTP attempt is aborted.

## Remaining next

1. Configure hosted deployment secrets, external tracing, and durable cost
   aggregation.
2. Extend CI beyond Chromium to cross-browser runs if the product requires it.
3. Consider a periodic reconciliation sweep for jobs lost before the final
   failure handler runs (BullMQ owns retries and Node exposes manual retry).

## Phase validation record

- Backend: 70 Vitest tests passed; TypeScript build and ESLint passed.
- Backend integration: 11 database-backed tests passed against isolated
  PostgreSQL.
- AI service: 29 pytest tests passed, 1 skipped (the opt-in DB test); Ruff
  passed. The skipped database-backed retrieval test passed separately with the
  isolated database.
- Frontend: TypeScript/Vite build and ESLint passed.
- Latest E2E validation after the audit fixes: 37 Playwright tests passed with
  4 workers.
- Earlier repeatability evidence, from before those later audit fixes: 74
  Playwright tests passed with `--repeat-each=2` and 4 workers. That run does not
  cover the subsequent fixes.
- Migration: clean apply of all three migrations passed; the moderation
  migration was also applied over a legacy document row and preserved data.
- The two bounded follow-up tasks (initial enqueue-failure guard and ticket
  transaction integration tests) passed Astra audit. This is not full-phase
  independent audit approval.
- Hosted GitHub Actions run `40545993649` passed all five jobs on PR #1
  (frontend, backend, backend integration, AI service, E2E). Post-merge `main`
  run `40590896540` also passed all five jobs.
- Deployment preparation is implemented, but no hosted Render/Neon/Vercel
  deployment has been executed yet.

## Definition of done for each feature

- Route, controller/service, validation, authorization, and error behavior are
  implemented.
- Database writes use the owning service boundary.
- Unit/integration coverage exists for success and failure paths.
- Docker startup and the relevant manual/API smoke test pass.
- API and architecture docs are updated in the same change.
