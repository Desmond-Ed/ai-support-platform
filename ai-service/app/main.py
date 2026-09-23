from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.chat import router as chat_router
from app.api.knowledge import router as knowledge_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(
    title="AI Support Platform — AI Service",
    description=(
        "Owns AI processing only: RAG retrieval, LLM orchestration, embeddings, "
        "evaluation. Application state (users, tickets, conversations, auth) "
        "lives in the Node backend — this service never touches it directly."
    ),
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(chat_router, prefix="/api")
app.include_router(knowledge_router, prefix="/api")

# Phase 7+ routers mount here: /api/evaluate (groundedness scoring).
