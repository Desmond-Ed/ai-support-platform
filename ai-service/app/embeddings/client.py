from __future__ import annotations

import logging
import math
import time
from collections.abc import Callable
from typing import Any

from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_openai import OpenAIEmbeddings

from app.core.config import get_settings

DIMENSIONS = 1536
EMBEDDING_BATCH_SIZE = 20
EMBEDDING_MAX_ATTEMPTS = 3
EMBEDDING_RETRY_BASE_DELAY_SECONDS = 1.0

DOCUMENT_TASK_TYPE = "RETRIEVAL_DOCUMENT"
QUERY_TASK_TYPE = "RETRIEVAL_QUERY"

logger = logging.getLogger(__name__)


class EmbeddingUnavailableError(RuntimeError):
    """Raised when an embeddings provider remains rate limited after retries."""


def _provider() -> str:
    return get_settings().EMBEDDINGS_PROVIDER.strip().lower()


def embedding_configuration_error() -> str | None:
    """Return a safe configuration error without contacting the provider."""
    settings = get_settings()
    provider = _provider()

    if provider == "gemini":
        if not settings.GEMINI_API_KEY:
            return "GEMINI_API_KEY is required for knowledge embeddings"
        if not settings.GEMINI_EMBEDDING_MODEL:
            return "GEMINI_EMBEDDING_MODEL is required for knowledge embeddings"
        return None

    if provider == "openai":
        if not settings.OPENAI_API_KEY:
            return "OPENAI_API_KEY is required for knowledge embeddings"
        if not settings.OPENAI_EMBEDDING_MODEL:
            return "OPENAI_EMBEDDING_MODEL is required for knowledge embeddings"
        return None

    return f"Unsupported EMBEDDINGS_PROVIDER: {settings.EMBEDDINGS_PROVIDER}"


def embedding_model() -> str:
    settings = get_settings()
    if _provider() == "openai":
        return settings.OPENAI_EMBEDDING_MODEL
    return settings.GEMINI_EMBEDDING_MODEL


def _client() -> Any:
    error = embedding_configuration_error()
    if error:
        raise RuntimeError(error)

    settings = get_settings()
    if _provider() == "gemini":
        return GoogleGenerativeAIEmbeddings(
            model=settings.GEMINI_EMBEDDING_MODEL,
            api_key=settings.GEMINI_API_KEY,
            task_type=DOCUMENT_TASK_TYPE,
            output_dimensionality=DIMENSIONS,
        )

    kwargs: dict[str, object] = {
        "model": settings.OPENAI_EMBEDDING_MODEL,
        "api_key": settings.OPENAI_API_KEY,
    }
    if settings.OPENAI_BASE_URL:
        kwargs["base_url"] = settings.OPENAI_BASE_URL
    return OpenAIEmbeddings(**kwargs)  # type: ignore[arg-type]


def _status_code(exc: Exception) -> int | None:
    current: BaseException | None = exc
    while current is not None:
        for attribute in ("status_code", "code", "status"):
            value = getattr(current, attribute, None)
            if isinstance(value, int):
                return value
        current = current.__cause__ or current.__context__
    return None


def _is_rate_limit(exc: Exception) -> bool:
    if _status_code(exc) == 429:
        return True
    message = str(exc).upper()
    return "429" in message or "RESOURCE_EXHAUSTED" in message


def _call_with_retry[T](
    operation: Callable[[], T],
    *,
    max_attempts: int = EMBEDDING_MAX_ATTEMPTS,
    base_delay: float = EMBEDDING_RETRY_BASE_DELAY_SECONDS,
) -> T:
    for attempt in range(1, max_attempts + 1):
        try:
            return operation()
        except Exception as exc:
            if not _is_rate_limit(exc):
                raise
            if attempt >= max_attempts:
                raise EmbeddingUnavailableError(
                    "Embedding provider rate limit retries exhausted"
                ) from exc
            delay = base_delay * (2 ** (attempt - 1))
            logger.warning(
                "Embedding provider rate limited; retrying",
                extra={"attempt": attempt, "max_attempts": max_attempts, "delay": delay},
            )
            if delay:
                time.sleep(delay)

    raise EmbeddingUnavailableError("Embedding provider rate limit retries exhausted")


def _normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return vector
    return [value / norm for value in vector]


def _validated(vectors: list[list[float]], expected: int) -> list[list[float]]:
    if len(vectors) != expected or any(len(vector) != DIMENSIONS for vector in vectors):
        raise RuntimeError(
            f"Embedding provider returned vectors other than {DIMENSIONS} dimensions"
        )
    values = [[float(value) for value in vector] for vector in vectors]
    if _provider() == "gemini":
        return [_normalize(vector) for vector in values]
    return values


def embed_documents(texts: list[str]) -> list[list[float]]:
    """Generate provider-backed document embeddings and enforce the pgvector contract."""
    if not texts:
        return []

    client = _client()
    is_gemini = _provider() == "gemini"
    vectors: list[list[float]] = []
    for start in range(0, len(texts), EMBEDDING_BATCH_SIZE):
        batch = texts[start : start + EMBEDDING_BATCH_SIZE]

        def embed_batch(batch: list[str] = batch) -> list[list[float]]:
            if is_gemini:
                return client.embed_documents(
                    batch,
                    batch_size=len(batch),
                    task_type=DOCUMENT_TASK_TYPE,
                    output_dimensionality=DIMENSIONS,
                )
            return client.embed_documents(batch)

        vectors.extend(_call_with_retry(embed_batch))

    return _validated(vectors, len(texts))


def embed_query(text: str) -> list[float]:
    """Embed a retrieval query with the provider's query-side method."""
    client = _client()

    def embed() -> list[float]:
        if _provider() == "gemini":
            return client.embed_query(
                text,
                task_type=QUERY_TASK_TYPE,
                output_dimensionality=DIMENSIONS,
            )
        return client.embed_query(text)

    vector = _call_with_retry(embed)
    return _validated([vector], 1)[0]
