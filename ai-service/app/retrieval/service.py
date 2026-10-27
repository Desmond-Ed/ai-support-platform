from __future__ import annotations

from typing import Any

from app.core.config import get_settings
from app.embeddings.client import embed_query

settings = get_settings()


def retrieve_context(query: str, limit: int = 4) -> list[dict[str, Any]]:
    """Return relevant knowledge-base chunks using pgvector similarity.

    This is intentionally conservative: if the database is unavailable or no
    rows match, the function returns an empty list so the chat endpoint can
    mark the answer as ungrounded and escalate to a human.
    """
    if not settings.DATABASE_URL:
        return []

    try:
        import psycopg

        query_vector = embed_query(query)
        vector_literal = f"[{','.join(str(value) for value in query_vector)}]"

        with psycopg.connect(settings.DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT kc.content,
                           1 - (e.vector <=> %s::vector) AS similarity
                    FROM knowledge_chunks kc
                    JOIN knowledge_documents kd ON kd.id = kc."documentId"
                    JOIN embeddings e ON e."chunkId" = kc.id
                    WHERE kd.status = 'READY'
                      AND kd."moderationStatus" = 'APPROVED'
                    ORDER BY similarity DESC, kc."chunkIndex" ASC
                    LIMIT %s
                    """,
                    (vector_literal, limit),
                )
                rows = cur.fetchall()
    except Exception:
        return []

    return [
        {"content": row[0], "similarity": float(row[1]) if row[1] is not None else 0.0}
        for row in rows
    ]
