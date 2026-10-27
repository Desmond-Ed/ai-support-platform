# Project Memory

## Verified facts

- Backend package scripts live in `backend/package.json`; run them from
  `backend`, not the repository root.
- Development Compose publishes backend `4000`, frontend `5173`, AI service
  `8000`, PostgreSQL `5432`, and Redis host port `6380`.
- Isolated E2E Compose publishes frontend `5174`, backend `4001`, AI `8001`,
  PostgreSQL `5433`, and Redis `6381`. It uses separate containers, volumes,
  database, and network; never point tests at the development stack.
- Host port `6379` is commonly occupied by unrelated local projects, which is
  why the E2E stack uses `6381`.
- The backend mounts `backend/src` into `/app/src` and uses `tsx watch`.
- The API prefix is `/api`; the router mounts health, auth, users, conversations,
  tickets, notifications, knowledge, admin, and analytics.
- The auth cookie path is `/api/auth`, so refresh/logout requests use that path.
- Prisma 7 reads `backend/prisma.config.ts` (not a config under `prisma/`) and
  requires `datasource` singular plus `import 'dotenv/config'` for host runs.
- E2E seeded identities are `e2e.admin@example.com`, `e2e.agent@example.com`,
  and `e2e.customer@example.com`; password `E2ePassword123!`.
- The E2E LLM stub control is published on host `8082`; the stub itself listens
  on container port `8080`.
- Express 5 exposes `req.query` as a getter. Replacing it requires
  `Object.defineProperty`; direct assignment throws in strict mode.
- PowerShell variables retain old values when a request assignment fails; never
  trust `$refresh.StatusCode` after an exception without resetting it.
- Knowledge retrieval requires both `status = READY` and
  `moderationStatus = APPROVED`.
- `moderationVersion` is the optimistic concurrency token for moderation.
  Ingestion retry is claimed by Node and uses
  `knowledge-document-<id>-retry-<attempt>`.
- Audit metadata is allowlisted. Never add content, credentials, or tokens.
- The E2E stub tokenizes embedding inputs, so content-key matching does not work
  for failure injection. It uses an exact input-count failure control instead;
  the retry fixture has 13 chunks.
- The applied moderation migration is
  `20261026180000_add_knowledge_moderation`; migration config is
  `backend/prisma.config.ts`.

## Decisions

- Use module augmentation for Express request typing in `auth.types.ts`.
- Keep shared JWT payload types in `types/auth.types.ts`; middleware must not
  redeclare them.
- Keep refresh tokens revocable in PostgreSQL and hash them before storage.
- Keep `jti` in refresh JWTs as uniqueness entropy even though the database
  lookup uses `tokenHash`.
- Use Docker or local development, but never both on port 4000 at once.
- Keep E2E provider boundaries deterministic with a local OpenAI-compatible
  stub; do not add a production fake-success mode or auth bypass.
- Wait for explicit authenticated/realtime UI state in Playwright helpers, not
  fixed timeouts. Session failures under parallel load came from reloading
  before localStorage received the token.
- Create unique customers per test; do not share notification read state.
- Escalation owns one ticket and at most one SYSTEM handoff message; repeated
  handoff calls must not duplicate either.
- Moderation, ingestion retry, ticket assignment/status changes, and admin user
  changes write their audit row in the same transaction as the state mutation.
- Rejected/archived knowledge is removed from retrieval by the query invariant,
  not by deleting data. Knowledge content is immutable this phase.
- Approval is blocked until ingestion is READY. Retry only exists for FAILED
  ingestion and is queue-state aware.
- Use token-aware lexical E2E embeddings rather than one constant vector, so
  accumulated approved fixtures do not randomly displace the refund context.
- Scope retry failure injection by exact embedding input count; do not use a
  global failure window that can break concurrent chat tests.
- The audit view exposes an allowlisted metadata projection only; reject unsafe
  keys at write time.

## Next implementation surface

Address hosted deployment hardening, tracing, durable cost aggregation, hosted
CI verification, and optional reconciliation for ingestion jobs abandoned by a
worker crash. Cross-browser E2E remains optional.
