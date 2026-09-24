# Engineering Handoff

## Current state

The active project is `C:\Users\USER\Documents\ai-support-platform`.
The backend is a Node.js/Express/TypeScript service under `backend/` and
has working authentication routes mounted at `/api/auth`. The Docker backend
listens on port 4000. The auth smoke test passed for login, refresh, logout,
and refresh-after-logout rejection.

## Start the backend

Run from the repository root:

```powershell
cd C:\Users\USER\Documents\ai-support-platform
docker compose up --build backend
```

Leave that terminal attached. Use a second terminal for requests. Do not run
`npm run dev` simultaneously with Docker because both bind port 4000.

## Validate code

```powershell
cd C:\Users\USER\Documents\ai-support-platform\backend
npm run build
npx --no-install tsc --noEmit
```

The backend test suite currently passes 37 tests, including authentication,
profile authorization, conversation ownership, ticket behavior, notification
behavior, knowledge queue handoff, and Socket.IO authentication. The Python
service tests currently pass 9 tests covering chat grounding, health, bounded
document chunking, and embeddings; database-backed
ingestion imports its database driver lazily so local health/chat tests do not
require it. On Windows, install the requirements needed for database-backed
ingestion without `uvloop`, which is Unix-only.

## Auth smoke test expectations

- Register or login: `200` for login, `201` for register.
- Refresh with the same PowerShell web session: `200`.
- Logout: `204`.
- Refresh after logout: `401`.

Use `-UseBasicParsing` with Windows PowerShell `Invoke-WebRequest`.

## Important implementation notes

- Refresh tokens are stored as SHA-256 hashes, never raw values.
- `jti` is a random UUID used to ensure refresh JWT uniqueness. It does not
  equal the Prisma `RefreshToken.id`.
- Registration never accepts a role and creates CUSTOMER accounts through
  repository/database defaults.
- The access-token role is intentionally stateless; role changes can remain
  stale until the access token expires.
- Refresh rotation uses a conditional revoke inside the transaction before
  issuing a replacement token, so concurrent requests cannot rotate one
  active token twice.
- Knowledge document creation persists a `PENDING` row before enqueueing an
  `ingest-document` BullMQ job with a deterministic document-based job ID.
- Python ingestion uses paragraph-aware bounded chunks. Provider-backed
  1536-dimensional embeddings and pgvector writes are implemented with a
  conservative degraded path when provider configuration is unavailable.
- The frontend operations dashboard supports login, customer ticket creation
  and history, agent/admin queue operations, assignment, status changes,
  notifications, and analytics summaries.
- The live local frontend is currently served at `http://localhost:8080` when
  run directly with Vite; Compose still uses port `5173`.

## Workspace trap

There have been two similarly named workspace copies. Docker must be started
from the same checkout that contains the current edits. Confirm the mounted
source with:

```powershell
docker exec asp-backend sed -n '1,30p' /app/src/routes/index.ts
```

It must show `authRouter` and `router.use('/auth', authRouter)`.

## Validation status

- Backend: 37 tests, build, and lint pass.
- AI service: 9 tests pass.
- Frontend: build and lint pass.
- Live customer API flow passes login, conversation creation, ticket creation,
  and ticket listing.
- Playwright Chromium installation is currently blocked by external download
  timeouts, so browser E2E execution remains pending.
