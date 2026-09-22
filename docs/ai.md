# Node ↔ Python Service Boundary — Decision Log

Purpose: this is interview material. Every time the Node↔AI-service boundary
gets a new call site, the decision (sync vs queued, failure mode, scaling
story) gets recorded here *when it's built*, not reconstructed after the
fact.

## Standing principles (apply to every decision below)

1. **Ownership**: Node owns application state (users/tickets/conversations/
   auth). Python owns AI processing only (embeddings/retrieval/LLM/eval).
   The AI service is treated as an untrusted, replaceable dependency from
   Node's point of view — Node never assumes it's up.
2. **Sync vs queued** is decided per call site by one question: *is a human
   actively waiting on this specific response right now?*
   - Yes → synchronous HTTP call from Node to the AI service, with a
     timeout and a defined degraded-mode response.
   - No → BullMQ job. Node enqueues, returns immediately, and the AI
     service (or a worker) processes it out-of-band.
3. **Independent scaling**: Node and Python are deployed as separate
   Railway services with separate resource limits, so a CPU-heavy
   embedding batch job doesn't starve the request-handling Node process,
   and vice versa. Each can be scaled by replica count independently.

## Phase 1 — Health check (sync)

- **Call**: none yet between services; each exposes its own `/api/health`
  independently. This is intentional — health checks should never depend
  on a downstream service being healthy, or a single outage cascades into
  every service reporting unhealthy.
- **Down/slow behavior**: N/A yet — no cross-service call exists.
- **Scaling**: each service's Dockerfile/compose entry is independent
  (separate build context, separate container, separate port). Nothing
  to reconcile yet.

## Phase 2 — Knowledge-base write ownership (established, not yet exercised)

- **Decision**: Node/Prisma is the sole writer for all core application
  state models. `KnowledgeDocument`, `KnowledgeChunk`, and `Embedding`
  are the one deliberate exception — Node creates the initial
  `KnowledgeDocument` row (`status = PENDING`) and enqueues a BullMQ
  ingestion job, then the Python worker connects to the same Postgres
  database *directly* (via psycopg, since Prisma Client is TS-only) to
  write chunks, embeddings, and flip the document to `READY`/`FAILED`.
- **Why this doesn't violate the ownership rule**: the rule as written
  scopes "application state" specifically to users, tickets,
  conversations, authentication, and permissions. Knowledge/embedding
  data isn't in that list, and the spec's own §12 ingestion workflow
  explicitly has the Python worker "store chunks + vectors" itself. Node
  still fully owns the document's lifecycle status transition trigger
  (nothing gets ingested unless Node created the row and queued the
  job) — Python can't originate new documents on its own.
- **Down/slow behavior**: not yet applicable — no live call exists until
  Phase 7 builds the actual ingestion worker. Flagging now so it's not
  forgotten: if the Python worker crashes mid-ingestion, the
  `KnowledgeDocument` row is left at `PROCESSING` indefinitely unless
  Phase 7 adds either a timeout/reconciliation job or a try/catch that
  writes `FAILED` + `errorMessage` on the way out. Decide and record
  this when Phase 7 actually builds the worker.
- **Scaling**: unaffected by this decision — Python's direct Postgres
  connection is a separate concern from the Node↔Python HTTP boundary,
  and doesn't change either service's independent scaling story.

## Phase 2 — pgvector storage (established, not yet exercised)

- **Decision**: `Embedding` is its own table (not a vector column inline
  on `KnowledgeChunk`), storing `vector(1536)` via Prisma's
  `Unsupported(...)` escape hatch, keyed 1:1 to a chunk for now.
- **Why separate from KnowledgeChunk**: allows re-embedding a chunk with
  a different model/dimension count without touching chunk content, and
  leaves room for multiple embedding versions to coexist during a future
  model migration (test a new embedding model against production data
  before cutover) — a `chunkId @unique` constraint can be loosened to a
  plain foreign key later if that's ever needed, without a content
  migration.
- **Trade-off being accepted now**: an extra join for every retrieval
  query, versus the flexibility above. Revisit if Phase 7's retrieval
  latency numbers make that join a real cost.


- **Phase 6 (Python AI service exists) / Phase 7 (RAG)**: the chat-reply
  call (`POST /api/conversations/:id/messages` → AI service) is the first
  real sync boundary — a customer is watching a typing indicator. Needs:
  timeout budget, what Node shows the user if the AI service times out or
  errors (Operating Rule 6 implies: escalate to human rather than fail
  silently), and whether retries are safe (they're not, by default, for
  an LLM call — could double-charge tokens and double-post a reply).
- **Phase 7 (ingestion)**: knowledge-base document ingestion/embedding is
  the first queued boundary — nobody is blocked waiting on it. BullMQ job
  enqueued by Node, processed by the AI service; Node polls/gets notified
  on completion via the existing Socket.IO `notification` event rather
  than a new mechanism (per the spec's instruction not to invent new
  event systems).
- **Phase 15 (cost monitoring)**: token usage/cost needs to be attributed
  per-conversation. Decision pending: does the AI service report cost
  back to Node synchronously in the chat-reply response payload, or does
  it write to a shared metrics store Node reads from? Will record the
  tradeoff here when built.
