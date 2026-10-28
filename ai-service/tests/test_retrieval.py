import sys

from app.retrieval import service


class FakeCursor:
    def __init__(self) -> None:
        self.executions: list[tuple[str, tuple]] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, sql: str, params: tuple) -> None:
        self.executions.append((sql, params))

    def fetchall(self):
        return [("Refund policy details.", 0.91)]


class FakeConnection:
    def __init__(self) -> None:
        self.cursor_instance = FakeCursor()

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self) -> FakeCursor:
        return self.cursor_instance


def test_retrieval_requires_ready_and_approved_documents(monkeypatch) -> None:
    connection = FakeConnection()
    fake_psycopg = type("FakePsycopg", (), {"connect": staticmethod(lambda _url: connection)})

    monkeypatch.setitem(sys.modules, "psycopg", fake_psycopg)
    monkeypatch.setattr(service.settings, "DATABASE_URL", "postgresql://test")
    monkeypatch.setattr(service, "embed_query", lambda _query: [0.1] * 1536)

    result = service.retrieve_context("How long do refunds take?", limit=3)

    assert result == [{"content": "Refund policy details.", "similarity": 0.91}]
    sql, params = connection.cursor_instance.executions[0]
    assert "kd.status = 'READY'" in sql
    assert 'kd."moderationStatus" = \'APPROVED\'' in sql
    assert params[1] == 3


def test_retrieval_logs_failures_and_returns_empty_context(monkeypatch, caplog) -> None:
    def fail_embedding(_query: str):
        raise RuntimeError("embedding provider unavailable")

    monkeypatch.setattr(service.settings, "DATABASE_URL", "postgresql://test")
    monkeypatch.setattr(service, "embed_query", fail_embedding)

    with caplog.at_level("ERROR"):
        result = service.retrieve_context("How long do refunds take?", limit=3)

    assert result == []
    assert "Knowledge retrieval failed" in caplog.text
    assert "embedding provider unavailable" in caplog.text
