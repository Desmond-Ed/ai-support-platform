import pytest

from app.embeddings import client


def test_embed_documents_rejects_missing_provider_key(monkeypatch) -> None:
    monkeypatch.setattr(client.get_settings(), "OPENAI_API_KEY", "")

    with pytest.raises(RuntimeError, match="OPENAI_API_KEY is required"):
        client.embed_documents(["refund policy"])


def test_embed_documents_validates_provider_dimensions(monkeypatch) -> None:
    monkeypatch.setattr(client.get_settings(), "OPENAI_API_KEY", "test-key")

    class FakeEmbeddings:
        def __init__(self, **_kwargs):
            pass

        def embed_documents(self, _texts):
            return [[0.1]]

    monkeypatch.setattr(client, "OpenAIEmbeddings", FakeEmbeddings)

    with pytest.raises(RuntimeError, match="1536 dimensions"):
        client.embed_documents(["refund policy"])


def test_embed_query_uses_query_embedding_and_validates_dimensions(monkeypatch) -> None:
    monkeypatch.setattr(client.get_settings(), "OPENAI_API_KEY", "test-key")

    class FakeEmbeddings:
        def __init__(self, **_kwargs):
            pass

        def embed_query(self, _text):
            return [0.25] * 1536

    monkeypatch.setattr(client, "OpenAIEmbeddings", FakeEmbeddings)

    vector = client.embed_query("when do refunds arrive?")

    assert len(vector) == 1536
    assert vector[0] == 0.25