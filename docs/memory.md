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
  `backend/prisma.config.ts`, which prefers `DATABASE_URL_UNPOOLED` for
  migrations and falls back to `DATABASE_URL`.
- Deployment target: Vercel frontend, Render free Docker services for backend
  and AI, Neon Postgres/pgvector, and flat-rate Redis (Aiven Valkey preferred;
  Redis Cloud fallback) with `maxmemory-policy=noeviction`.
- Render free services sleep after inactivity and consume 750 instance hours per
  workspace per month; two always-on services exceed that budget. Do not add
  keep-alive pings.
- Neon needs a pooled `-pooler` URL for the running apps and a direct URL for
  `prisma migrate deploy`; both use `sslmode=require`. Redis TLS uses `rediss://`.
- DeepSeek direct chat defaults are base URL `https://api.deepseek.com` and
  model `deepseek-flash`. The OpenAI-compatible NVIDIA example is
  `https://integrate.api.nvidia.com/v1` with
  `deepseek-ai/deepseek-v4.1-flash`. These were checked on 2026-10-28.
- Embeddings always use OpenAI `text-embedding-3-small` at 1536 dimensions, so
  `OPENAI_API_KEY` is required even when chat uses DeepSeek/NVIDIA.
- AI `/api/health` is dependency-free; `/api/ready` checks the database and
  embeddings key and returns 503 when either is unavailable.
- BullMQ knowledge ingestion uses 4 attempts with exponential backoff starting
  at 30 seconds. Python marks `FAILED` only on the final attempt; Node reconciles
  a still-`PENDING`/`PROCESSING` document if the final HTTP attempt is aborted.
- Aiven Valkey free capacity and the `noeviction` requirement come from provider
  documentation; whether this account can set `noeviction` on the free plan is
  not yet verified. Live Neon/Aiven TLS handshakes are also unverified.

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

Execute the hosted Vercel/Render/Neon/Valkey deployment, configure production
secrets, verify live TLS and Redis `noeviction`, add external tracing and durable
cost aggregation, and consider a periodic sweep for jobs lost before the final
failure handler runs. Cross-browser E2E remains optional.
