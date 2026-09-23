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

## In progress / next

1. Add provider-backed embeddings, pgvector writes, and vector retrieval.
2. Add resource-specific Socket.IO room authorization and frontend subscriptions.
3. Implement agent availability, notifications, and admin
   workflows.
4. Add analytics queries, frontend workflows, and Playwright end-to-end tests.
5. Add production deployment configuration, observability, and cost tracking.

## Definition of done for each feature

- Route, controller/service, validation, authorization, and error behavior are
  implemented.
- Database writes use the owning service boundary.
- Unit/integration coverage exists for success and failure paths.
- Docker startup and the relevant manual/API smoke test pass.
- API and architecture docs are updated in the same change.
