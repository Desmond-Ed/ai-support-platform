import psycopg
import pytest

from app.retrieval import service as retrieval_service


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def execute(self, query, params):
        self.query = query
        self.params = params

    def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(self, rows):
        self.rows = rows

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def cursor(self):
        return FakeCursor(self.rows)


def test_retrieval_filters_below_threshold_and_returns_source_metadata(monkeypatch):
    rows = [
        ("chunk-low", "doc-low", "Low Match", "weak context", 0.71),
        ("chunk-high", "doc-high", "Verified Policy", "strong context", 0.83),
    ]
    monkeypatch.setattr(retrieval_service.settings, "DATABASE_URL", "postgresql://test")
    monkeypatch.setattr(retrieval_service.settings, "RETRIEVAL_MIN_SIMILARITY", 0.72)
    monkeypatch.setattr(retrieval_service, "embed_documents", lambda texts: [[0.1, 0.2]])
    monkeypatch.setattr(psycopg, "connect", lambda connection_string: FakeConnection(rows))

    result = retrieval_service.retrieve_context("policy query")

    assert result == [
        {
            "chunk_id": "chunk-high",
            "document_id": "doc-high",
            "title": "Verified Policy",
            "content": "strong context",
            "similarity": 0.83,
        },
    ]


def test_retrieval_raises_typed_error_for_embedding_failure(monkeypatch):
    monkeypatch.setattr(retrieval_service.settings, "DATABASE_URL", "postgresql://test")

    def fail_embedding(texts):
        raise RuntimeError("embedding provider unavailable")

    monkeypatch.setattr(retrieval_service, "embed_documents", fail_embedding)

    with pytest.raises(retrieval_service.RetrievalError, match="Knowledge-base retrieval failed"):
        retrieval_service.retrieve_context("policy query")