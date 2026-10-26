import asyncio
import sys

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
