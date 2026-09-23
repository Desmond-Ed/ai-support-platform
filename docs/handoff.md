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

The current backend test suite includes `tests/auth.service.test.ts` and
`tests/auth.middleware.test.ts`, `tests/user.service.test.ts`, and
`tests/conversation.service.test.ts`. It passes with eighteen tests covering
registration, login failure behavior, refresh rotation, concurrent-refresh
rejection, token reuse, logout, logout-all, role middleware, and profile
sanitization, plus customer-scoped conversation creation, listing, and message
ownership and AI reply persistence. The Python service byte-compiles
successfully, and its health test passes. On Windows, install the
requirements needed for local tests without `uvloop`, which is Unix-only.

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

## Workspace trap

There have been two similarly named workspace copies. Docker must be started
from the same checkout that contains the current edits. Confirm the mounted
source with:

```powershell
docker exec asp-backend sed -n '1,30p' /app/src/routes/index.ts
```

It must show `authRouter` and `router.use('/auth', authRouter)`.
