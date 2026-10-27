# End-to-end tests

Playwright covers the customer-to-agent support workflow on an isolated,
deterministic full stack. The suite never points at the normal development
Compose project.

## Isolated stack

`docker-compose.e2e.yml` at the repository root owns its containers, volumes,
database, network, and host ports:

| Service | Host URL |
| --- | --- |
| Frontend | `http://localhost:5174` |
| Backend | `http://localhost:4001` |
| AI service | `http://localhost:8001` |
| PostgreSQL (host) | `5433` |
| Redis (host) | `6381` |
| LLM stub control (host) | `8082` |

Port `6379` is deliberately not used because unrelated local projects commonly
occupy it. The E2E database is `ai_support_platform_e2e`; the development
database is untouched.

## First run / clean run

```powershell
cd C:\Users\USER\Documents\ai-support-platform\e2e
npm install
npx playwright install chromium

cd C:\Users\USER\Documents\ai-support-platform
docker compose -f docker-compose.e2e.yml up -d --build --wait
docker compose -f docker-compose.e2e.yml exec -T backend npx prisma migrate deploy
docker compose -f docker-compose.e2e.yml exec -T backend npm run db:seed:e2e

cd e2e
npm test
```

Shorthand from `e2e/` after dependencies are installed:

```powershell
npm run test:ci
```

`docker compose ... down -v --remove-orphans` removes the isolated E2E data.

## What is covered

- Authentication: customer/agent/admin login, wrong password, unknown email,
  reload-persisted sessions, logout API plus local-session clearing, and
  server-side role rejection.
- Conversations and tickets: health checks, ticket creation persistence for all
  priorities, customer UI restrictions, agent assignment persistence, and status
  changes surviving reload.
- Chat: grounded AI replies, persisted history, provider-outage degradation via
  a real SYSTEM escalation with no fabricated AI reply, and idempotent manual
  handoff (one ticket, one handoff message).
- Realtime: agent replies reach an open customer page, resolution notifications
  arrive without reload, assignment notifications reach agents, and mark-all-read
  persists per customer.
- Authorization: another customer and an unassigned agent cannot read or alter a
  conversation; resolved conversations reject further agent replies with `409`.
- Notifications and analytics: customer/agent panels plus role-appropriate
  analytics visibility, including zero-filled UTC time-series data.
- Operations: knowledge approval/rejection/restoration with audits and optimistic
  versions, deterministic ingestion failure plus retry recovery, ticket
  resolution timestamp lifecycle, audit filtering, admin-only moderation/audit
  access, and the admin analytics UI.
- Retrieval gating: approved and ready knowledge is available; pending, rejected,
  archived, or failed knowledge is not.

## Determinism and isolation

- `support/stub-llm.mjs` is an OpenAI-compatible local provider. It returns
  deterministic token-aware 1536-dimensional embeddings and a grounded refund
  answer, so ingestion, retrieval, and chat do not call a paid provider.
  Token-aware embeddings matter because accumulating approved E2E documents with
  identical vectors can otherwise displace the refund fixture during retrieval.
- `SIMULATE_AI_OUTAGE` in a chat message makes chat completion return HTTP 500.
  The application must then persist the degraded SYSTEM escalation rather than a
  fake success.
- `POST http://localhost:8082/control/fail-embeddings` controls embedding
  failure. The retry test sets an exact input count, so only its multi-chunk
  ingestion fails while concurrent single-query chat embeddings continue
  normally. The control is cleared before retry.
- Tests create unique customers through the API rather than sharing mutable
  notification state. Dynamic agents are registered then promoted through the
  admin API.
- `global-setup.ts` waits for backend health, creates a unique refund knowledge
  document, polls ingestion until `READY`, then approves it through the
  moderation API before chat specs run.
- Seeded identities for auth coverage: `e2e.admin@example.com`,
  `e2e.agent@example.com`, `e2e.customer@example.com`; password
  `E2ePassword123!`.
- Login helpers wait for the authenticated app shell and a confirmed user
  session before reloading or navigating; they do not use fixed sleeps.

## Configuration

Defaults target the isolated stack. Override when needed:

```powershell
$env:FRONTEND_URL='http://localhost:5174'
$env:BACKEND_URL='http://localhost:4001'
$env:AI_SERVICE_URL='http://localhost:8001'
$env:E2E_WORKERS='4'
npm test
```

If a real provider is required for a targeted manual check, set the AI
service's provider URL/key and model variables through Compose. The default
suite does not need them.

## Repeatability and CI

The current suite contains 37 tests. It passed with 4 workers, and the full
suite passed with `--repeat-each=2` (74 tests):

```powershell
$env:E2E_WORKERS='4'
npx playwright test --repeat-each=2
```

`operations.spec.ts` is serial within its file because its retry test toggles
the stub's narrowly scoped embedding-failure control. The failure matches an
exact input count, so it does not affect concurrent chat requests.

GitHub Actions runs the full suite on Ubuntu with Chromium and uploads the HTML
report, traces, and sanitized service logs on failure; the E2E stack is always
torn down afterward. The workflow also has a separate service-backed backend
integration job. It has not been executed on hosted runners for the latest
changes.
