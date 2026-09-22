-- Runs automatically on first container start (docker-entrypoint-initdb.d).
-- Enables pgvector so Prisma's `extensions = [vector]` and the AI service's
-- embedding columns have somewhere to live. Safe to re-run.
CREATE EXTENSION IF NOT EXISTS vector;
