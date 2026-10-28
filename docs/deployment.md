# Deployment Guide - Vercel, Render, Neon, and Valkey

This is the free-tier deployment target for the portfolio build. It replaces the
earlier Railway assumption. Provider details below were checked on **2026-10-28**;
free-tier limits and model IDs change, so re-check them before a real deployment.

## Target topology

| Component | Host | Runtime | Notes |
|---|---|---|---|
| Frontend | Vercel | Static Vite build | Existing Vercel setup is unchanged. |
| Backend | Render free Web Service | Docker, root `backend/`, `Dockerfile.prod` | Render injects `PORT`. |
| AI service | Render free Web Service | Docker, root `ai-service/`, `Dockerfile.prod` | Render injects `PORT`; binds `${PORT:-8000}`. |
| PostgreSQL + pgvector | Neon free | PostgreSQL 16-compatible | Use the pooled URL for apps, direct URL for migrations. |
| Redis / BullMQ | Aiven Valkey free (preferred) | Flat-rate Redis-compatible | Must use `maxmemory-policy=noeviction`. |
| Chat LLM | DeepSeek direct or NVIDIA Build | OpenAI-compatible API | `LLM_PROVIDER` selects the provider. |
| Embeddings | Google Gemini `gemini-embedding-001` (default) or OpenAI | 1536 dimensions | `EMBEDDINGS_PROVIDER` selects the provider; do not mix embedding spaces. |

Do **not** use Render's free PostgreSQL for this project: Render free databases
expire after 30 days. Do **not** use a per-command metered Redis (for example
Upstash) for the BullMQ worker; an idle-polling worker consumes commands while
doing no useful work.

## Free-tier limits that shape the design

### Render

- 750 instance hours per workspace per month.
- Free Web Services run at 0.1 CPU and 512 MB RAM.
- Free Web Services spin down after about 15 minutes without traffic.
- The next request cold-starts the service; expect roughly a minute, often more
  under load.
- Two services kept awake 24/7 for a 31-day month would consume about 1,488
  instance hours, which exceeds the 750-hour allowance. Let the services sleep;
  do not add keep-alive pings.
- The AI chat path can cold-start while a customer is waiting. The backend's
  existing 15-second AI timeout degrades to the human-handoff path. The ingestion
  worker has its own retry budget so a cold start is less likely to lose a job.

### Neon

- 1 GB storage per project, 100 CU-hours per month, 5 GB egress, 100 projects.
- Scales to zero after about 5 minutes of inactivity, so the first database
  request can be slow.
- Use the pooled `-pooler` host for the backend and AI service.
- Use the direct (non-pooled) host for `prisma migrate deploy`.
- Both URLs should include `sslmode=require`.

### Aiven Valkey (preferred Redis)

- 1 GB RAM, single node, no card, no time limit on the free plan.
- Aiven may set `maxmemory` to 50% on the free plan; BullMQ data is small, so
  capacity is not the constraint.
- BullMQ requires `maxmemory-policy=noeviction`. Set this in the Aiven service
  configuration and verify it; if the free plan does not expose the setting, use
  another flat-rate Redis provider.
- Aiven free endpoints are not VPC/static-IP endpoints. That is acceptable for
  this project.

### Redis Cloud free fallback

- About 30 MB and 30 connections. Small, but enough for a low-traffic portfolio
  demo if `noeviction` is available.
- Confirm the policy in the provider console or with `CONFIG GET
  maxmemory-policy` before relying on it.

## 1. Create Neon Postgres

1. Create a Neon project and database.
2. Copy both connection strings from the Neon dashboard:
   - pooled connection for `DATABASE_URL`;
   - direct connection for `DATABASE_URL_UNPOOLED`.
3. Ensure both include `sslmode=require`.
4. Run migrations once from the repository, against the direct URL:

```powershell
cd backend
$env:DATABASE_URL_UNPOOLED = "postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
npx prisma migrate deploy
```

`backend/prisma.config.ts` prefers `DATABASE_URL_UNPOOLED` and falls back to
`DATABASE_URL`. The initial migration runs `CREATE EXTENSION IF NOT EXISTS
"vector"`, so pgvector is enabled by the migration. Do not point
`prisma migrate deploy` at the pooled URL.

The running backend uses the pooled URL. The AI service also uses the pooled URL
for its PostgreSQL connections, not the migration client. Neon's pooler supports
protocol-level prepared statements, which psycopg 3.3 uses; if a driver-specific
pooling issue appears, switch only the AI service to the direct URL.

## 2. Create Redis / Valkey

1. Create an Aiven Valkey free service (or Redis Cloud free).
2. Enable TLS if the provider requires it; the URL must start with `rediss://`.
3. Set the eviction policy to `noeviction`.
4. Verify the policy:

```bash
redis-cli -u "$REDIS_URL" CONFIG GET maxmemory-policy
```

If the provider exposes only a console setting, verify the resulting value in the
console. BullMQ will lose jobs or block incorrectly under an eviction policy such
as `allkeys-lru`.

## 3. Deploy the AI service on Render

Create a Render **Web Service** from the repository:

- Runtime: Docker.
- Root directory: `ai-service`.
- Dockerfile path: `Dockerfile.prod`.
- Health check path: `/api/health`.
- Instance type: free.

Set these environment variables (see the table below):

```text
ENV=production
DATABASE_URL=<Neon pooled URL>
EMBEDDINGS_PROVIDER=gemini
GEMINI_API_KEY=<Gemini API key>
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://integrate.api.nvidia.com/v1
LLM_API_KEY=<NVIDIA Build key>
LLM_MODEL=deepseek-ai/deepseek-v4.1-flash
CORS_ORIGINS=["https://<frontend>.vercel.app"]
BACKEND_URL=https://<backend>.onrender.com
```

For DeepSeek direct instead:

```text
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=<DeepSeek key>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
```

Gemini embeddings use `RETRIEVAL_DOCUMENT` for ingestion and `RETRIEVAL_QUERY`
for retrieval, request 1536 output dimensions, and L2-normalize the truncated
vectors before storing/querying. The Gemini free tier is quota-limited and
Google may use free-tier content to improve its products; do not upload
sensitive knowledge on the free tier. NVIDIA Build is also rate-limited
(roughly 40 requests/minute), which is why chat retries 429s with backoff.

To use OpenAI embeddings instead, set `EMBEDDINGS_PROVIDER=openai`,
`OPENAI_EMBEDDING_MODEL=text-embedding-3-small`, and `OPENAI_API_KEY`. Keep one
provider/model for the lifetime of the database; changing embedding spaces
requires re-embedding every chunk.

After the first deploy, verify:

```text
GET https://<ai-service>.onrender.com/api/health  -> 200
GET https://<ai-service>.onrender.com/api/ready   -> 200
```

`/api/ready` checks the database connection, the pgvector extension, and the
required LLM and embeddings configuration without making provider calls. It
returns `503` with `{"detail":{"status":"not_ready","checks":...}}` when any check
fails; the `checks` object identifies the failed dependency without exposing
secrets. Use `/api/health` for the Render liveness probe so a sleeping database
does not make the service look dead.

## 4. Deploy the backend on Render

Create a second Render **Web Service**:

- Runtime: Docker.
- Root directory: `backend`.
- Dockerfile path: `Dockerfile.prod`.
- Health check path: `/api/health`.
- Instance type: free.

The production image runs `node dist/server.js`; `backend/src/config/env.ts`
reads `PORT` and `backend/src/server.ts` listens on it. Render's injected `PORT`
therefore controls the bind port. The AI Dockerfile expands `${PORT:-8000}` in
its shell-form `CMD`; the backend uses the Node app's `PORT` handling.

Set the backend environment:

```text
NODE_ENV=production
PORT=<injected by Render>
DATABASE_URL=<Neon pooled URL>
REDIS_URL=rediss://<user>:<password>@<host>:<port>
AI_SERVICE_URL=https://<ai-service>.onrender.com
CORS_ORIGIN=https://<frontend>.vercel.app
JWT_ACCESS_SECRET=<long random secret>
JWT_REFRESH_SECRET=<different long random secret>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
SEED_ADMIN_EMAIL=<initial admin email>
SEED_ADMIN_PASSWORD=<long random password>
SEED_ADMIN_NAME=<display name>
```

Do not put `DATABASE_URL_UNPOOLED` in the running backend unless you are also
using it for manual migration commands; it is not needed by the server.

Seed the first admin explicitly after migrations:

```powershell
cd backend
$env:NODE_ENV = "production"
$env:DATABASE_URL = "<direct Neon URL>"
$env:SEED_ADMIN_EMAIL = "<initial admin email>"
$env:SEED_ADMIN_PASSWORD = "<long random password>"
$env:SEED_ADMIN_NAME = "<display name>"
npm run db:seed
```

Production seeding fails if `SEED_ADMIN_EMAIL` or `SEED_ADMIN_PASSWORD` is
missing and creates only that admin. It never creates the known development
agent/customer accounts in production. Do not run the seed against a production
database with placeholder credentials, and do not reuse the development
password.

CORS needs no code change per deploy. `CORS_ORIGIN` is a comma-separated list;
the same value is used by Express and Socket.IO. For example:

```text
CORS_ORIGIN=https://my-app.vercel.app,https://my-app-git-main.vercel.app
```

After the deploy, verify `GET https://<backend>.onrender.com/api/health`.
Then confirm that the AI service URL and Redis URL are reachable from the
backend's logs.

## 5. Deploy the frontend on Vercel

Set the Vercel project environment variables:

```text
VITE_API_URL=https://<backend>.onrender.com
VITE_SOCKET_URL=https://<backend>.onrender.com
```

Redeploy so Vite embeds the values. After the Vercel URL is known, update the
backend `CORS_ORIGIN` and AI `CORS_ORIGINS` and let Render redeploy those
services.

## Environment variable reference

### Backend

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` on Render. |
| `PORT` | injected | Render sets it; the app defaults to 4000 locally. |
| `DATABASE_URL` | yes | Neon pooled URL with `sslmode=require`. |
| `DATABASE_URL_UNPOOLED` | migrations only | Direct Neon URL. Read by `prisma.config.ts`. |
| `REDIS_URL` | yes | `rediss://` for TLS providers. |
| `AI_SERVICE_URL` | yes | Public Render URL of the AI service. |
| `CORS_ORIGIN` | yes | Comma-separated Vercel origins. Used by REST and Socket.IO. |
| `JWT_ACCESS_SECRET` | yes | Long random value. |
| `JWT_REFRESH_SECRET` | yes | Different long random value. |
| `JWT_ACCESS_EXPIRES_IN` | no | Defaults to `15m`. |
| `JWT_REFRESH_EXPIRES_IN` | no | Defaults to `7d`. |
| `SEED_ADMIN_EMAIL` | production seed | Required when seeding with `NODE_ENV=production`. |
| `SEED_ADMIN_PASSWORD` | production seed | Required when seeding with `NODE_ENV=production`; no default. |
| `SEED_ADMIN_NAME` | no | Defaults to `Admin`. |

### AI service

| Variable | Required | Notes |
|---|---|---|
| `ENV` | yes | `production` on Render. |
| `PORT` | injected | Render sets it; Docker defaults to 8000. |
| `DATABASE_URL` | yes | Neon pooled URL with `sslmode=require`. |
| `EMBEDDINGS_PROVIDER` | yes | `gemini` (default) or `openai`. |
| `GEMINI_API_KEY` | Gemini | Required when `EMBEDDINGS_PROVIDER=gemini`. |
| `GEMINI_EMBEDDING_MODEL` | no | Defaults to `gemini-embedding-001`. |
| `OPENAI_EMBEDDING_MODEL` | no | Defaults to `text-embedding-3-small`; used only with OpenAI embeddings. |
| `OPENAI_API_KEY` | conditional | Required when chat or embeddings use OpenAI. |
| `LLM_PROVIDER` | yes | `openai`, `deepseek`, or `openai-compatible`. |
| `DEEPSEEK_API_KEY` | DeepSeek | Required when `LLM_PROVIDER=deepseek`. |
| `DEEPSEEK_BASE_URL` | no | Defaults to `https://api.deepseek.com`. |
| `DEEPSEEK_MODEL` | no | Defaults to `deepseek-flash`. |
| `LLM_BASE_URL` | openai-compatible | For NVIDIA: `https://integrate.api.nvidia.com/v1`. |
| `LLM_API_KEY` | openai-compatible | Provider API key. |
| `LLM_MODEL` | openai-compatible | For NVIDIA: `deepseek-ai/deepseek-v4.1-flash`. |
| `BACKEND_URL` | no | Informational today; set to the backend Render URL. |
| `CORS_ORIGINS` | yes | JSON list containing the Vercel origin. |

`LLM_PROVIDER=openai` uses `OPENAI_API_KEY` and the existing `gpt-4o-mini`
default. `OPENAI_BASE_URL` remains available for deterministic local fixtures.

### Frontend

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | yes | Backend public URL. |
| `VITE_SOCKET_URL` | yes | Backend public URL; Socket.IO uses the same server. |

## TLS and connection strings

- Neon: keep `sslmode=require` in both pooled and direct URLs. Prisma's
  `@prisma/adapter-pg`/`pg` stack and Python `psycopg` both use the URL as given.
- Aiven/Redis Cloud: use `rediss://` (not `redis://`) for the TLS endpoint.
  `ioredis` understands `rediss://` and BullMQ uses the same connection with
  `maxRetriesPerRequest: null`.
- Never paste real connection strings or API keys into the repository, issue
  comments, or audit metadata.

## Ingestion retry and cold starts

Knowledge ingestion is asynchronous and is allowed to survive a cold start:

- BullMQ uses 4 attempts with exponential backoff starting at 30 seconds
  (30s, 60s, 120s between attempts).
- Each HTTP attempt to the AI service has a 30-second timeout.
- The backend sends the current attempt and maximum attempts to the AI service.
- The AI service only writes `FAILED` on the final attempt; earlier failures
  leave the document available for the next attempt.
- If the final HTTP attempt is aborted before the AI service can update the row,
  the worker reconciles a still-`PENDING`/`PROCESSING` document to `FAILED`.
- A failed ingestion can still be retried manually from the moderation UI using
  the existing Node-owned retry flow.

This is deliberately tolerant of Render's cold start. Because every attempt is
still bounded, a permanently broken queue or database ends in `FAILED` instead
of leaving the document stuck forever.

## Verification checklist

1. `GET /api/health` on both Render services returns 200.
2. `GET /api/ready` on the AI service returns 200 after Neon is awake.
3. Register a customer, log in, and load the dashboard through Vercel.
4. Send a chat message and confirm a grounded or escalated response.
5. Upload a knowledge document, wait for `READY`, approve it, and confirm it is
   retrieved.
6. Stop the AI service or force an ingestion failure and confirm the document
   ends in `FAILED` rather than staying `PENDING`.
7. Confirm browser console has no CORS errors and Socket.IO connects.
8. Check the Redis policy is `noeviction` and the queue is not growing without
   bound.

## Troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| Browser CORS error | Vercel origin missing from backend `CORS_ORIGIN` or AI `CORS_ORIGINS`. | Update env, redeploy; remember both lists. |
| Socket.IO cannot connect | `VITE_SOCKET_URL` wrong, or origin missing from `CORS_ORIGIN`. | Verify backend URL and same-origin CORS list. |
| Backend `P1001` / connection timeout | Wrong Neon host, direct URL used at runtime, or Neon asleep. | Use pooled URL for apps; wake Neon and retry. |
| Migration fails | Pooled URL used for `prisma migrate deploy`, or `DATABASE_URL_UNPOOLED` missing. | Use direct URL with `sslmode=require`. |
| AI `/api/ready` is 503 | Database unreachable, pgvector missing, or LLM/embeddings config incomplete. | Read `checks` in the response; it names the failed dependency without exposing secrets. |
| First request takes about a minute | Render free service was asleep. | Expected; let cold start finish. Do not add keep-alive pings. |
| BullMQ job disappears or blocks | Redis eviction policy is not `noeviction`. | `CONFIG GET maxmemory-policy`; use a flat-rate Redis with `noeviction`. |
| Chat provider 429s/5xx | Rate limit or transient provider outage. | The AI service retries with backoff, then returns `503` with a retry message. |
| Documents stuck `PENDING` | Worker is down, or the final failure handler could not reach the database. | Check backend logs, Redis/queue state, and AI `/api/ready`; once the row is reconciled to `FAILED`, use the moderation retry action. |
| Render free quota exhausted | Two services kept awake. | Let them sleep; 750 hours cannot cover two always-on services. |

## Verification status

Checked against provider documentation on 2026-10-28:

- DeepSeek base URL `https://api.deepseek.com` and model `deepseek-flash`.
- NVIDIA Build base URL `https://integrate.api.nvidia.com/v1` and model
  `deepseek-ai/deepseek-v4.1-flash`.
- Gemini embeddings `gemini-embedding-001` support `RETRIEVAL_DOCUMENT`,
  `RETRIEVAL_QUERY`, and `output_dimensionality=1536`; truncated Matryoshka
  vectors are L2-normalized.
- Render free Web Service hours, memory/CPU, and spin-down behavior.
- Neon free storage/CU-hours, scale-to-zero, and pooled/direct URLs.
- Aiven Valkey free capacity and the BullMQ `noeviction` requirement.

Not independently verified in this repository:

- That the Aiven Valkey free plan exposes `maxmemory-policy=noeviction` in its
  console/configuration for this account.
- That Redis Cloud free exposes the required policy.
- TLS handshakes from `psycopg`/`ioredis` against the live Neon/Aiven endpoints
  (the connection-string formats are documented, but no hosted deploy was run).
- Exact Render cold-start time under this workload; the roughly one-minute
  figure is the documented planning assumption, not a measured result.
- Any current availability change in the third-party model catalog.
- Both production Dockerfiles were built locally on 2026-10-28; no hosted
  deployment or live provider call was made.
