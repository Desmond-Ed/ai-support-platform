from __future__ import annotations

from langchain_openai import OpenAIEmbeddings

from app.core.config import get_settings

MODEL = "text-embedding-3-small"
DIMENSIONS = 1536


def embed_documents(texts: list[str]) -> list[list[float]]:
    """Generate provider-backed embeddings and enforce the pgvector contract."""
    if not texts:
        return []

    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required for knowledge embeddings")

    embeddings = OpenAIEmbeddings(model=MODEL, api_key=settings.OPENAI_API_KEY)
    vectors = embeddings.embed_documents(texts)
    if len(vectors) != len(texts) or any(len(vector) != DIMENSIONS for vector in vectors):
        raise RuntimeError(f"Embedding provider returned vectors other than {DIMENSIONS} dimensions")
    return [[float(value) for value in vector] for vector in vectors]