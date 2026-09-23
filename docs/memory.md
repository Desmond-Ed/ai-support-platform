# Project Memory

## Verified facts

- Backend package scripts live in `backend/package.json`; run them from
  `backend`, not the repository root.
- Docker Compose publishes backend `4000`, frontend `5173`, AI service
  `8000`, PostgreSQL `5432`, and Redis host port `6380`.
- The backend mounts `backend/src` into `/app/src` and uses `tsx watch`.
- The API prefix is `/api`; the router currently mounts health and auth.
- The auth cookie path is `/api/auth`, so refresh/logout requests use that
  path for the browser cookie to be sent.
- PowerShell variables retain old values when a request assignment fails;
  never trust `$refresh.StatusCode` after an exception without resetting it.

## Decisions

- Use module augmentation for Express request typing in `auth.types.ts`.
- Keep shared JWT payload types in `types/auth.types.ts`; middleware must not
  redeclare them.
- Keep refresh tokens revocable in PostgreSQL and hash them before storage.
- Keep `jti` in refresh JWTs as uniqueness entropy even though the database
  lookup uses `tokenHash`.
- Use Docker or local development, but never both on port 4000 at once.

## Next implementation surface

Add focused auth tests, then build authenticated user and conversation
workflows. After that, implement Socket.IO event contracts, ticket lifecycle,
AI request boundaries, and knowledge ingestion.
