from __future__ import annotations

from typing import Any

from app.core.config import get_settings

settings = get_settings()


def retrieve_context(query: str, limit: int = 4) -> list[dict[str, Any]]:
    """Return relevant knowledge-base chunks using full-text search.

    This is intentionally conservative: if the database is unavailable or no
    rows match, the function returns an empty list so the chat endpoint can
    mark the answer as ungrounded and escalate to a human.
    """
    if not settings.DATABASE_URL:
        return []

    try:
        import psycopg

        with psycopg.connect(settings.DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT kc.content,
                           ts_rank(
                               to_tsvector('english', kc.content),
                               plainto_tsquery('english', %s)
                           ) AS similarity
                    FROM knowledge_chunks kc
                    JOIN knowledge_documents kd ON kd.id = kc."documentId"
                    WHERE kd.status = 'READY'
                      AND to_tsvector('english', kc.content) @@ plainto_tsquery('english', %s)
                    ORDER BY similarity DESC, kc."chunkIndex" ASC
                    LIMIT %s
                    """,
                    (query, query, limit),
                )
                rows = cur.fetchall()
    except Exception:
        return []

    return [
        {"content": row[0], "similarity": float(row[1]) if row[1] is not None else 0.0}
        for row in rows
    ]
