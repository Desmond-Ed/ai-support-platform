from __future__ import annotations

from langchain_openai import OpenAIEmbeddings

from app.core.config import get_settings

MODEL = "text-embedding-3-small"
DIMENSIONS = 1536


def _client() -> OpenAIEmbeddings:
    settings = get_settings()
    if not settings.OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is required for knowledge embeddings")
    kwargs: dict[str, object] = {"model": MODEL, "api_key": settings.OPENAI_API_KEY}
    if settings.OPENAI_BASE_URL:
        kwargs["base_url"] = settings.OPENAI_BASE_URL
    return OpenAIEmbeddings(**kwargs)  # type: ignore[arg-type]


def _validated(vectors: list[list[float]], expected: int) -> list[list[float]]:
    if len(vectors) != expected or any(len(vector) != DIMENSIONS for vector in vectors):
        raise RuntimeError(
            f"Embedding provider returned vectors other than {DIMENSIONS} dimensions"
        )
    return [[float(value) for value in vector] for vector in vectors]


def embed_documents(texts: list[str]) -> list[list[float]]:
    """Generate provider-backed document embeddings and enforce the pgvector contract."""
    if not texts:
        return []

    vectors = _client().embed_documents(texts)
    return _validated(vectors, len(texts))


def embed_query(text: str) -> list[float]:
    """Embed a retrieval query with the provider's query-side method."""
    vector = _client().embed_query(text)
    return _validated([vector], 1)[0]
