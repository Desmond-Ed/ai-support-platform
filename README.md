# AI-Powered Customer Support Platform

A customer support platform combining a human agent/admin workflow with an
AI layer (RAG over a knowledge base) that answers customer questions and
hands off to a human agent when it can't answer confidently or accurately.

Built as a portfolio project demonstrating polyglot service-boundary design
between a Node.js application-state service and a Python AI-processing
service. See [`docs/ai.md`](docs/ai.md) for the sync-vs-queued reasoning
behind that boundary, recorded phase by phase.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Backend | Node.js + Express + TypeScript, Prisma ORM |
| Database | PostgreSQL + pgvector |
| Auth | JWT + refresh tokens (httpOnly cookies) |
| Real-time | Socket.IO |
| Cache/Queue | Redis + BullMQ |
| AI service | Python + FastAPI, LangChain/LlamaIndex, RAG |
| Testing | Vitest, pytest, Playwright |
| Infra | Docker + Docker Compose, GitHub Actions |
| Deploy | Vercel (frontend), Railway (backend/AI service/DB) |

## Repository structure

```
ai-support-platform/
├── frontend/       React + Vite + TS + Tailwind
├── backend/        Node.js + Express + TS + Prisma
├── ai-service/     Python + FastAPI (RAG, embeddings, LLM, evaluation)
├── knowledge-base/ Source documents for RAG ingestion
├── e2e/            Playwright end-to-end tests
├── docs/           Architecture, AI boundary decisions, and other docs
├── docker-compose.yml
└── .env.example
```

Full system diagram: [`docs/architecture.md`](docs/architecture.md).

## Setup

### Prerequisites
- Node.js 22+
- Python 3.12+
- Docker + Docker Compose
- An LLM provider API key (OpenAI, for the `OPENAI_API_KEY` env var —
  needed from Phase 6 onward, not required to boot Phase 1's scaffold)

### 1. Clone and configure environment

```bash
git clone <repo-url>
cd ai-support-platform
cp .env.example .env
cp .env.example backend/.env
cp .env.example ai-service/.env
cp frontend/.env.example frontend/.env
```

Edit `.env` (and the per-service copies) to fill in real values — at minimum
generate real JWT secrets instead of the placeholders:

```bash
openssl rand -base64 48
```

### 2. Start everything with Docker Compose

```bash
docker-compose up --build
```

This starts:
- `postgres` — Postgres 16 with the `pgvector` extension enabled on first
  boot (see `docker/postgres/init.sql`)
- `redis`
- `backend` — Express API on `:4000` (hot reload)
- `ai-service` — FastAPI on `:8000` (hot reload)
- `frontend` — Vite dev server on `:5173`

### 3. Verify

- Frontend: http://localhost:5173
- Backend health: http://localhost:4000/api/health
- AI service health: http://localhost:8000/api/health
- AI service interactive docs: http://localhost:8000/docs

### Running services without Docker (local dev)

```bash
# Backend
cd backend && npm install && npm run dev

# AI service
cd ai-service
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
./venv/bin/uvicorn app.main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```

## Project status

Phase 3 authentication is implemented and verified through Docker. The
backend currently exposes health and authentication routes, including
registration, login, refresh-token rotation, logout, and logout-all. The
remaining conversation, ticket, agent, admin, analytics, and AI workflows
are planned but not yet implemented. See [`docs/project-plan.md`](docs/project-plan.md)
for the current delivery state.

Current handoff notes are in [`docs/handoff.md`](docs/handoff.md). The
architecture, product requirements, database model, and implementation
memory are maintained in the other documents under `docs/`.

## Out of scope (documented, not built)

Voice input, multi-language support, PWA, and other "bonus" ideas are
explicitly deferred as future work, not part of the current build plan.
