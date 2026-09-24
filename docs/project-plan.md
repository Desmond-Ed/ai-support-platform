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

## Remaining next

1. Install the Playwright Chromium browser in a network-enabled environment and
   run the smoke suite; expand coverage beyond the health/UI smoke test.
2. Add time-series analytics, audit-log views, and full knowledge moderation.
3. Configure hosted deployment secrets, external tracing, and durable cost
    aggregation.

## Phase validation record

- Backend: 37 Vitest tests passed; TypeScript build and ESLint passed.
- AI service: 9 pytest tests passed.
- Frontend: TypeScript/Vite build and ESLint passed.
- Live API smoke: customer login, conversation creation, ticket creation, and
   customer ticket listing passed.
- Playwright browser installation remains blocked by external Chromium download
   timeouts; the test project and dependencies are present.

## Definition of done for each feature

- Route, controller/service, validation, authorization, and error behavior are
  implemented.
- Database writes use the owning service boundary.
- Unit/integration coverage exists for success and failure paths.
- Docker startup and the relevant manual/API smoke test pass.
- API and architecture docs are updated in the same change.
