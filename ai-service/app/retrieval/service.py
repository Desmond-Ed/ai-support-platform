from __future__ import annotations

from typing import Any

from app.core.config import get_settings
from app.embeddings.client import embed_documents

settings = get_settings()


class RetrievalError(RuntimeError):
    """Raised when evidence retrieval cannot be completed reliably."""


def retrieve_context(query: str, limit: int = 4) -> list[dict[str, Any]]:
    """Return chunks meeting the configured vector-similarity threshold.

    An empty list means retrieval completed successfully but found no relevant
    chunks. Configuration, embedding, and database failures raise RetrievalError.
    """
    if not settings.DATABASE_URL:
        raise RetrievalError("DATABASE_URL is not configured")

    try:
        import psycopg

        query_vector = embed_documents([query])[0]
        vector_literal = f"[{','.join(str(value) for value in query_vector)}]"

        with psycopg.connect(settings.DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                      SELECT kc.id,
                          kd.id,
                          kd.title,
                          kc.content,
                          1 - (e.vector <=> %s::vector) AS similarity
                    FROM knowledge_chunks kc
                    JOIN knowledge_documents kd ON kd.id = kc."documentId"
                    JOIN embeddings e ON e."chunkId" = kc.id
                    WHERE kd.status = 'READY'
                    ORDER BY similarity DESC, kc."chunkIndex" ASC
                    LIMIT %s
                    """,
                    (vector_literal, limit),
                )
                rows = cur.fetchall()
    except Exception as exc:
        raise RetrievalError("Knowledge-base retrieval failed") from exc

    chunks = []
    for row in rows:
        similarity = float(row[4]) if row[4] is not None else 0.0
        if similarity < settings.RETRIEVAL_MIN_SIMILARITY:
            continue
        chunks.append(
            {
                "chunk_id": str(row[0]),
                "document_id": str(row[1]),
                "title": str(row[2]),
                "content": row[3],
                "similarity": similarity,
            }
        )
    return chunks
