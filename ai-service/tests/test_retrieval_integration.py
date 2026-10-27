import os
import uuid

import pytest

from app.retrieval import service

DATABASE_URL = os.getenv("DATABASE_URL", "")
RUN_INTEGRATION = os.getenv("RUN_DB_INTEGRATION") == "1" and bool(DATABASE_URL)

pytestmark = pytest.mark.skipif(
    not RUN_INTEGRATION,
    reason="Set RUN_DB_INTEGRATION=1 and DATABASE_URL to run the pgvector integration test.",
)


def _vector_literal() -> str:
    return "[" + ",".join(["1"] + ["0"] * 1535) + "]"


def _delete_fixture_records(psycopg, user_id: str) -> None:
    with psycopg.connect(DATABASE_URL) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                'DELETE FROM knowledge_documents WHERE "uploadedById" = %s',
                (user_id,),
            )
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))


def test_retrieval_only_returns_ready_and_approved_documents(monkeypatch) -> None:
    import psycopg

    vector = _vector_literal()
    run_id = uuid.uuid4().hex
    user_id = str(uuid.uuid4())
    fixtures = {
        "approved": ("READY", "APPROVED"),
        "pending": ("READY", "PENDING_REVIEW"),
        "failed": ("FAILED", "APPROVED"),
        "rejected": ("READY", "REJECTED"),
        "archived": ("READY", "ARCHIVED"),
    }
    contents = {label: f"retrieval-fixture-{run_id}-{label}" for label in fixtures}
    document_ids = {label: str(uuid.uuid4()) for label in fixtures}

    try:
        with psycopg.connect(DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO users (id, email, "passwordHash", name, role, "updatedAt")
                    VALUES (%s, %s, 'integration-test', 'Retrieval Integration', 'ADMIN', NOW())
                    """,
                    (user_id, f"retrieval-{user_id}@example.com"),
                )
                for label, (status, moderation_status) in fixtures.items():
                    document_id = document_ids[label]
                    content = contents[label]
                    cursor.execute(
                        """
                        INSERT INTO knowledge_documents
                          (id, title, content, status, "uploadedById", "sourceType",
                           "moderationStatus", "updatedAt")
                        VALUES (%s, %s, %s, %s, %s, 'MANUAL', %s, NOW())
                        """,
                        (
                            document_id,
                            f"Retrieval fixture {run_id} {label}",
                            content,
                            status,
                            user_id,
                            moderation_status,
                        ),
                    )
                    chunk_id = str(uuid.uuid4())
                    cursor.execute(
                        """
                        INSERT INTO knowledge_chunks (id, "documentId", content, "chunkIndex")
                        VALUES (%s, %s, %s, 0)
                        """,
                        (chunk_id, document_id, content),
                    )
                    cursor.execute(
                        """
                        INSERT INTO embeddings (id, "chunkId", model, vector)
                        VALUES (%s, %s, 'text-embedding-3-small', %s::vector)
                        """,
                        (str(uuid.uuid4()), chunk_id, vector),
                    )

        with psycopg.connect(DATABASE_URL) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT COUNT(*)
                    FROM knowledge_chunks kc
                    JOIN knowledge_documents kd ON kd.id = kc."documentId"
                    JOIN embeddings e ON e."chunkId" = kc.id
                    """
                )
                count_row = cursor.fetchone()
                assert count_row is not None
                candidate_count = int(count_row[0])

        assert candidate_count >= len(fixtures)

        monkeypatch.setattr(service.settings, "DATABASE_URL", DATABASE_URL)
        monkeypatch.setattr(service, "embed_query", lambda _query: [1.0] + [0.0] * 1535)

        result = service.retrieve_context("integration retrieval", limit=candidate_count)

        result_by_content = {item["content"]: item for item in result}
        approved = result_by_content.get(contents["approved"])
        assert approved is not None
        assert approved["similarity"] == pytest.approx(1.0)

        for label in ("pending", "failed", "rejected", "archived"):
            assert contents[label] not in result_by_content
    finally:
        _delete_fixture_records(psycopg, user_id)
