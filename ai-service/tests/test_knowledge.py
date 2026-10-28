import asyncio
import sys

import pytest
from fastapi import HTTPException

from app.api import knowledge


class FakeCursor:
    def __init__(self) -> None:
        self.executions: list[tuple[str, tuple | None]] = []
        self._result = None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql: str, params: tuple | None = None) -> None:
        self.executions.append((sql, params))
        if "SELECT content" in sql:
            self._result = ("Refund policy details.",)
        elif "RETURNING id" in sql:
            self._result = ("chunk-1",)
        else:
            self._result = None

    def fetchone(self):
        return self._result


class FakeConnection:
    def __init__(self) -> None:
        self.cursor_instance = FakeCursor()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self) -> FakeCursor:
        return self.cursor_instance


def test_ingestion_links_chunks_to_document_and_replaces_prior_chunks(monkeypatch) -> None:
    connection = FakeConnection()
    fake_psycopg = type("FakePsycopg", (), {"connect": staticmethod(lambda _url: connection)})

    monkeypatch.setitem(sys.modules, "psycopg", fake_psycopg)
    monkeypatch.setattr(knowledge.settings, "DATABASE_URL", "postgresql://test")
    monkeypatch.setattr(knowledge, "embed_documents", lambda texts: [[0.1] * 1536 for _ in texts])

    result = asyncio.run(knowledge.ingest_knowledge_document({"documentId": "document-1"}))

    assert result == {"status": "READY", "documentId": "document-1"}
    chunk_insert = next(
        (sql, params)
        for sql, params in connection.cursor_instance.executions
        if 'INSERT INTO knowledge_chunks' in sql
    )
    assert '"documentId"' in chunk_insert[0]
    assert chunk_insert[1] == ("document-1", "Refund policy details.", 0)
    assert any(
        'DELETE FROM knowledge_chunks WHERE "documentId" = %s' in sql
        for sql, _params in connection.cursor_instance.executions
    )


def _set_up_failing_ingestion(monkeypatch):
    connection = FakeConnection()
    fake_psycopg = type("FakePsycopg", (), {"connect": staticmethod(lambda _url: connection)})

    def fail_embedding(_texts):
        raise RuntimeError("embedding provider unavailable")

    monkeypatch.setitem(sys.modules, "psycopg", fake_psycopg)
    monkeypatch.setattr(knowledge.settings, "DATABASE_URL", "postgresql://test")
    monkeypatch.setattr(knowledge, "embed_documents", fail_embedding)
    return connection


def test_intermediate_ingestion_failure_leaves_status_for_retry(monkeypatch) -> None:
    connection = _set_up_failing_ingestion(monkeypatch)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            knowledge.ingest_knowledge_document(
                {"documentId": "document-1", "attempt": 1, "maxAttempts": 3}
            )
        )

    assert exc_info.value.status_code == 500
    assert not any(
        "status = 'FAILED'" in sql for sql, _params in connection.cursor_instance.executions
    )


def test_final_ingestion_failure_marks_document_failed(monkeypatch) -> None:
    connection = _set_up_failing_ingestion(monkeypatch)

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            knowledge.ingest_knowledge_document(
                {"documentId": "document-1", "attempt": 3, "maxAttempts": 3}
            )
        )

    assert exc_info.value.status_code == 500
    failure_update = next(
        (sql, params)
        for sql, params in connection.cursor_instance.executions
        if "status = 'FAILED'" in sql
    )
    assert failure_update[1] == ("embedding provider unavailable", "document-1")
