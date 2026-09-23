from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.ingestion.chunking import chunk_text

router = APIRouter()
settings = get_settings()


@router.post("/knowledge/ingest")
async def ingest_knowledge_document(payload: dict) -> dict:
    """Chunk + embed + store a pending KnowledgeDocument row.

    This is the Python-side ingestion endpoint called by the Node BullMQ worker.
    """
    document_id = str(payload.get("documentId") or "").strip()
    if not document_id:
        raise HTTPException(status_code=400, detail="documentId is required")

    if not settings.DATABASE_URL:
        raise HTTPException(status_code=503, detail="Knowledge-base database unavailable")

    try:
        import psycopg

        with psycopg.connect(settings.DATABASE_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, title, content, "sourceType"
                    FROM knowledge_documents
                    WHERE id = %s
                    """,
                    (document_id,),
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Knowledge document not found")

                document_id, title, content, source_type = row

                chunks = [
                    {"content": chunk, "index": index}
                    for index, chunk in enumerate(chunk_text(content))
                ]

                if not chunks:
                    raise HTTPException(status_code=400, detail="Document content is empty")

                for chunk in chunks:
                    cur.execute(
                        """
                        INSERT INTO knowledge_chunks (id, "documentId", content, "chunkIndex", "createdAt")
                        VALUES (gen_random_uuid(), %s, %s, %s, NOW())
                        RETURNING id
                        """,
                        (document_id, chunk["content"], chunk["index"]),
                    )
                    chunk_id = cur.fetchone()[0]

                    cur.execute(
                        """
                        INSERT INTO embeddings (id, "chunkId", model, vector, "createdAt")
                        VALUES (gen_random_uuid(), %s, %s, NULL, NOW())
                        """,
                        (chunk_id, "text-embedding-3-small"),
                    )

                cur.execute(
                    """
                    UPDATE knowledge_documents
                    SET status = 'READY', "errorMessage" = NULL, "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (document_id,),
                )

    except HTTPException:
        raise
    except Exception as exc:
        try:
            with psycopg.connect(settings.DATABASE_URL) as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE knowledge_documents
                        SET status = 'FAILED', "errorMessage" = %s, "updatedAt" = NOW()
                        WHERE id = %s
                        """,
                        (str(exc), document_id),
                    )
        except Exception:
            pass
        raise HTTPException(status_code=500, detail="Knowledge ingestion failed") from exc

    return {"status": "READY", "documentId": document_id}
