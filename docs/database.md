# Database Documentation

## Status
The full Prisma schema, initial migration, generated client, and Docker
PostgreSQL environment are present. Authentication has been exercised against
the running database: users and hashed refresh-token rows are created,
refresh tokens rotate, and logout revokes the current token. The broader
application entities are schema foundations and do not yet have API workflows.

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
  `Notification`, `ConversationFeedback`, `AuditLog`. This is
  "application state" per the ownership rule — Python never writes these.
- **Python writes directly** (via psycopg, not this Prisma client —
  Prisma Client is TS-only): `KnowledgeChunk`, `Embedding`, and
  `KnowledgeDocument.status`/`errorMessage` during ingestion. Node still
  *creates* the initial `KnowledgeDocument` row (status `PENDING`) and
  enqueues the BullMQ job — Python only writes once it's actually
  processing. This exactly matches the spec's §12 ingestion workflow.
  See `docs/ai.md` for the full reasoning.

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

Added on every foreign key, plus a few analytics-driven ones called out
in the schema comments: `Conversation.createdAt` (daily/weekly charts),
`Ticket.createdAt` (ticket volume), `ConversationFeedback.rating`
(satisfaction chart), `Notification(userId, read)` (unread count queries).

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

```bash
cd backend
npx prisma format      # auto-fixes styling, will error on real syntax problems
npx prisma validate    # schema-level validation
npx prisma migrate dev --name init_phase2_schema
npx prisma generate
```

The committed initial migration is under
`backend/prisma/migrations/20260921143341_init_phase2_schema/`. Do not edit a
generated client by hand; regenerate it from the schema.
