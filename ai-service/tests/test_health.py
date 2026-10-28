import os
import sys

os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost:5432/db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")

from fastapi.testclient import TestClient  # noqa: E402

from app.api import health  # noqa: E402
from app.main import app  # noqa: E402

client = TestClient(app)


class FakeCursor:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, _sql: str) -> None:
        pass

    def fetchone(self):
        return (1,)


class FakeConnection:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self) -> FakeCursor:
        return FakeCursor()


def _configure_openai(monkeypatch) -> None:
    monkeypatch.setattr(health.settings, "DATABASE_URL", "postgresql://test")
    monkeypatch.setattr(health.settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(health.settings, "OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(health.settings, "EMBEDDINGS_PROVIDER", "openai")


def test_health_check() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "ai-service"}


def test_readiness_requires_database_pgvector_and_provider_config(monkeypatch) -> None:
    fake_psycopg = type(
        "FakePsycopg",
        (),
        {"connect": staticmethod(lambda _url: FakeConnection())},
    )
    monkeypatch.setitem(sys.modules, "psycopg", fake_psycopg)
    _configure_openai(monkeypatch)

    response = client.get("/api/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "checks": {
            "database": True,
            "pgvector": True,
            "llm_config": True,
            "embeddings_config": True,
        },
    }


def test_readiness_fails_without_embedding_key(monkeypatch) -> None:
    fake_psycopg = type(
        "FakePsycopg",
        (),
        {"connect": staticmethod(lambda _url: FakeConnection())},
    )
    monkeypatch.setitem(sys.modules, "psycopg", fake_psycopg)
    _configure_openai(monkeypatch)
    monkeypatch.setattr(health.settings, "OPENAI_API_KEY", "")

    response = client.get("/api/ready")

    assert response.status_code == 503
    assert response.json()["detail"]["checks"] == {
        "database": True,
        "pgvector": True,
        "llm_config": False,
        "embeddings_config": False,
    }


def test_readiness_fails_without_llm_config(monkeypatch) -> None:
    fake_psycopg = type(
        "FakePsycopg",
        (),
        {"connect": staticmethod(lambda _url: FakeConnection())},
    )
    monkeypatch.setitem(sys.modules, "psycopg", fake_psycopg)
    _configure_openai(monkeypatch)
    monkeypatch.setattr(health.settings, "LLM_PROVIDER", "openai-compatible")
    monkeypatch.setattr(health.settings, "LLM_BASE_URL", "")
    monkeypatch.setattr(health.settings, "LLM_API_KEY", "")
    monkeypatch.setattr(health.settings, "LLM_MODEL", "")

    response = client.get("/api/ready")

    assert response.status_code == 503
    assert response.json()["detail"]["checks"]["llm_config"] is False
    assert response.json()["detail"]["checks"]["embeddings_config"] is True


def test_readiness_fails_when_database_is_unreachable(monkeypatch) -> None:
    def fail_connect(_url):
        raise OSError("connection refused")

    fake_psycopg = type("FakePsycopg", (), {"connect": staticmethod(fail_connect)})
    monkeypatch.setitem(sys.modules, "psycopg", fake_psycopg)
    _configure_openai(monkeypatch)

    response = client.get("/api/ready")

    assert response.status_code == 503
    assert response.json()["detail"]["checks"] == {
        "database": False,
        "pgvector": False,
        "llm_config": True,
        "embeddings_config": True,
    }
