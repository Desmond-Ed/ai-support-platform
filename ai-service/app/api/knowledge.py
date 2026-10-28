from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.embeddings.client import embed_documents, embedding_model
from app.ingestion.chunking import chunk_text

router = APIRouter()
settings = get_settings()


def _positive_int(value: object, default: int) -> int:
    try:
        parsed = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


def _mark_failed(document_id: str, error_message: str) -> None:
    try:
        import psycopg

        with psycopg.connect(settings.DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE knowledge_documents
                    SET status = 'FAILED', "errorMessage" = %s, "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (error_message, document_id),
                )
    except Exception:
        pass


@router.post("/knowledge/ingest")
async def ingest_knowledge_document(payload: dict) -> dict:
    """Chunk + embed + store a pending KnowledgeDocument row.

    This is the Python-side ingestion endpoint called by the Node BullMQ worker.
    """
    document_id = str(payload.get("documentId") or "").strip()
    if not document_id:
        raise HTTPException(status_code=400, detail="documentId is required")

    attempt = _positive_int(payload.get("attempt"), 1)
    max_attempts = _positive_int(payload.get("maxAttempts"), attempt)

    if not settings.DATABASE_URL:
        raise HTTPException(status_code=503, detail="Knowledge-base database unavailable")

    try:
        import psycopg

        with psycopg.connect(settings.DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT content
                    FROM knowledge_documents
                    WHERE id = %s
                    """,
                    (document_id,),
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Knowledge document not found")

                content = row[0]

                chunks = [
                    {"content": chunk, "index": index}
                    for index, chunk in enumerate(chunk_text(content))
                ]

                if not chunks:
                    raise HTTPException(status_code=400, detail="Document content is empty")

                cur.execute(
                    'DELETE FROM knowledge_chunks WHERE "documentId" = %s',
                    (document_id,),
                )

                vectors = embed_documents([chunk["content"] for chunk in chunks])
                for chunk, vector in zip(chunks, vectors, strict=True):
                    cur.execute(
                        """
                        INSERT INTO knowledge_chunks (
                            id, "documentId", content, "chunkIndex", "createdAt"
                        )
                        VALUES (gen_random_uuid(), %s, %s, %s, NOW())
                        RETURNING id
                        """,
                        (document_id, chunk["content"], chunk["index"]),
                    )
                    chunk_id = cur.fetchone()[0]

                    cur.execute(
                        """
                        INSERT INTO embeddings (id, "chunkId", model, vector, "createdAt")
                        VALUES (gen_random_uuid(), %s, %s, %s::vector, NOW())
                        """,
                        (
                            chunk_id,
                            embedding_model(),
                            f"[{','.join(str(value) for value in vector)}]",
                        ),
                    )

                cur.execute(
                    """
                    UPDATE knowledge_documents
                    SET status = 'READY', "errorMessage" = NULL, "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (document_id,),
                )

    except HTTPException as exc:
        if attempt >= max_attempts:
            _mark_failed(document_id, str(exc.detail))
        raise
    except Exception as exc:
        if attempt >= max_attempts:
            _mark_failed(document_id, str(exc))
        raise HTTPException(status_code=500, detail="Knowledge ingestion failed") from exc

    return {"status": "READY", "documentId": document_id}
