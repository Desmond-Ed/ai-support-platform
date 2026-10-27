# Database Documentation

## Status
The full Prisma schema, migrations, generated client, and Docker PostgreSQL
environment are present. Authentication has been exercised against the running
database: users and hashed refresh-token rows are created, refresh tokens
rotate, and logout revokes the current token. Conversations, messages, tickets,
assignments, notifications, knowledge documents, moderation/audit state, and
analytics-backed entities now have implemented API workflows. Knowledge chunks
and embeddings are written by the Python ingestion path as documented below.
The moderation migration has been verified both on a clean database and as a
forward upgrade over existing document rows.

## Entity list vs. spec (§4)

Spec listed 12 entities. Implemented as:

| Spec entity | Implementation |
|---|---|
| User | `User` model |
| Role | `Role` **enum** on `User.role`, not a separate table — simpler for a fixed 3-value RBAC set (CUSTOMER/AGENT/ADMIN) than a join table, and Prisma enums are still fully type-checked in TS. Revisit if you ever need dynamic/custom roles. |
| Conversation | `Conversation` model |
| Message | `Message` model |
| Ticket | `Ticket` model |
| TicketAssignment | `TicketAssignment` model |
| KnowledgeDocument | `KnowledgeDocument` model |
| KnowledgeChunk | `KnowledgeChunk` model |
| AgentAvailability | `AgentAvailability` model |
| Notification | `Notification` model |
| ConversationFeedback | `ConversationFeedback` model |
| AuditLog | `AuditLog` model |

Plus two additions beyond the spec's named list, both flagged as
implementing (not changing) the approved architecture:

| Addition | Why |
|---|---|
| `RefreshToken` | The approved auth architecture is JWT + refresh tokens (httpOnly cookies). A refresh token needs a persisted, revocable record for logout/rotation — a bare JWT can't be revoked before it expires. Stores a hash, never the raw token. |
| `Embedding` (separate from `KnowledgeChunk`) | The spec's own relationship diagram (§4) shows `KnowledgeChunk └── Embedding` as two things, not one — this schema keeps them separate so a chunk can be re-embedded (different model/dimensions) without touching its content, and so multiple embedding versions could coexist during a model migration. |

## Write ownership

- **Node/Prisma writes**: `User`, `RefreshToken`, `Conversation`,
  `Message`, `Ticket`, `TicketAssignment`, `AgentAvailability`,
  `Notification`, `ConversationFeedback`, and `AuditLog`. This is
  "application state" per the ownership rule - Python never writes these.
- **Python writes directly** (via psycopg, not this Prisma client -
  Prisma Client is TS-only): `KnowledgeChunk`, `Embedding`, and
  `KnowledgeDocument.status`/`errorMessage` during ingestion. Node still
  *creates* the initial `KnowledgeDocument` row (status `PENDING`) and
  enqueues the BullMQ job - Python only writes once it is actually
  processing. This matches the established ingestion workflow. See
  `docs/ai.md` for the full reasoning.
- **Moderation and audit are Node-owned**: Python must not write
  `moderationStatus`, moderation metadata, ingestion attempts, retry state,
  tickets, notifications, or audit rows. Node bumps `moderationVersion`,
  transitions moderation state, and writes the matching audit in one
  transaction. Ingestion retry is claimed by Node before enqueueing.

## pgvector

`Embedding.vector` is `Unsupported("vector(1536)")` — Prisma has no
native vector type, so:
- Prisma Client **cannot** read or write this column directly.
- The Python worker writes it directly via SQL.
- Similarity search (Phase 7) will use raw SQL with pgvector's
  `<->` / `<=>` distance operators, expected to live in Python via
  psycopg rather than Node.
- `1536` matches OpenAI's `text-embedding-3-small`. If a different
  embedding model is chosen in Phase 6/7, this literal must change and a
  new migration generated — it's not configurable at runtime.

## Indexes

Added on every foreign key, plus analytics/operations-driven indexes:

- `Conversation.createdAt` for daily/weekly charts.
- `Ticket.createdAt` for ticket volume and `Ticket.resolvedAt` for resolution
  time-series queries.
- `ConversationFeedback.rating` for the satisfaction chart.
- `Notification(userId, read)` for unread counts.
- `KnowledgeDocument.moderationStatus` and `moderatedById` for the moderation
  queue/detail paths.
- `AuditLog(action, createdAt)` for filtered, newest-first audit history.

## Knowledge moderation and ingestion retry

`KnowledgeDocument` stores immutable content plus:

- `moderationStatus`: `PENDING_REVIEW`, `APPROVED`, `REJECTED`, or `ARCHIVED`.
- `moderationReason`, `moderatedById`, and `moderatedAt`.
- `moderationVersion`: optimistic concurrency token incremented on every
  successful moderation transition.
- `ingestionAttempt`: incremented when Node claims a retry.

Only documents that are both ingestion `READY` and moderation `APPROVED` are
retrievable. Approval is rejected while ingestion is not ready. Retry is only
valid from `FAILED`; the retry job ID is
`knowledge-document-<id>-retry-<attempt>`.

The forward migration is
`backend/prisma/migrations/20261026180000_add_knowledge_moderation/`. A clean
database and an existing pre-migration document were both verified: legacy rows
are preserved with `PENDING_REVIEW`, version `0`, and attempt `0`.

Legacy rows are deliberately not auto-approved during migration. After rollout,
an admin must review each `PENDING_REVIEW` document in the moderation queue and
approve only rows whose ingestion status is `READY`; rejected or obsolete rows
should be rejected or archived. This keeps previously stored content out of
retrieval until an explicit moderation decision is audited.

## Cascade behavior

- Deleting a `User` cascades to their conversations, tickets, feedback,
  refresh tokens; `AuditLog.userId` is `SetNull`, not cascade, so the
  log entry survives user deletion for compliance purposes.
- Deleting a `Conversation` cascades to its messages, tickets, and
  feedback.
- Deleting a `KnowledgeDocument` cascades to its chunks, which cascades
  to their embeddings.
- An agent being unassigned from a conversation is `SetNull`
  (`Conversation.agentId`), not a cascade delete of the conversation.

## Verification command

Run the following from `backend` after schema changes:

```powershell
npx prisma format
npx prisma validate
npx prisma migrate dev --name <descriptive_name>
npx prisma generate
npm test
npm run test:integration
```

Committed migrations:

- `20260921143341_init_phase2_schema`
- `20260923155514_add_knowledge_document_content`
- `20261026180000_add_knowledge_moderation`

`npm run test:integration` uses the isolated E2E PostgreSQL by default
(`postgresql://postgres:postgres@localhost:5433/ai_support_platform_e2e`) or
`TEST_DATABASE_URL` when provided. It is not a mock suite. Do not edit a
generated client by hand; regenerate it from the schema.
