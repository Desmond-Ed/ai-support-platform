import math

import pytest

from app.embeddings import client


class FakeGeminiEmbeddings:
    instances: list["FakeGeminiEmbeddings"] = []

    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs
        self.document_calls: list[tuple[list[str], dict]] = []
        self.query_calls: list[tuple[str, dict]] = []
        self.__class__.instances.append(self)

    def embed_documents(self, texts, **kwargs):
        self.document_calls.append((texts, kwargs))
        return [[3.0, 4.0] + [0.0] * 1534 for _ in texts]

    def embed_query(self, text, **kwargs):
        self.query_calls.append((text, kwargs))
        return [3.0, 4.0] + [0.0] * 1534


def test_gemini_documents_use_task_type_dimensions_and_normalization(monkeypatch) -> None:
    FakeGeminiEmbeddings.instances.clear()
    monkeypatch.setattr(client, "GoogleGenerativeAIEmbeddings", FakeGeminiEmbeddings)
    monkeypatch.setattr(client.get_settings(), "EMBEDDINGS_PROVIDER", "gemini")
    monkeypatch.setattr(client.get_settings(), "GEMINI_API_KEY", "test-key")

    vectors = client.embed_documents(["refund policy"])

    fake = FakeGeminiEmbeddings.instances[0]
    assert fake.kwargs["model"] == "gemini-embedding-001"
    assert fake.kwargs["output_dimensionality"] == 1536
    assert fake.document_calls[0][1] == {
        "batch_size": 1,
        "task_type": "RETRIEVAL_DOCUMENT",
        "output_dimensionality": 1536,
    }
    assert len(vectors[0]) == 1536
    assert math.isclose(sum(value * value for value in vectors[0]), 1.0)


def test_gemini_batches_large_document_sets(monkeypatch) -> None:
    FakeGeminiEmbeddings.instances.clear()
    monkeypatch.setattr(client, "GoogleGenerativeAIEmbeddings", FakeGeminiEmbeddings)
    monkeypatch.setattr(client.get_settings(), "EMBEDDINGS_PROVIDER", "gemini")
    monkeypatch.setattr(client.get_settings(), "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(client, "EMBEDDING_BATCH_SIZE", 2)

    vectors = client.embed_documents(["one", "two", "three", "four", "five"])

    fake = FakeGeminiEmbeddings.instances[0]
    assert [len(texts) for texts, _kwargs in fake.document_calls] == [2, 2, 1]
    assert len(vectors) == 5


def test_gemini_query_uses_query_task_type(monkeypatch) -> None:
    FakeGeminiEmbeddings.instances.clear()
    monkeypatch.setattr(client, "GoogleGenerativeAIEmbeddings", FakeGeminiEmbeddings)
    monkeypatch.setattr(client.get_settings(), "EMBEDDINGS_PROVIDER", "gemini")
    monkeypatch.setattr(client.get_settings(), "GEMINI_API_KEY", "test-key")

    vector = client.embed_query("when do refunds arrive?")

    fake = FakeGeminiEmbeddings.instances[0]
    assert fake.query_calls == [
        (
            "when do refunds arrive?",
            {"task_type": "RETRIEVAL_QUERY", "output_dimensionality": 1536},
        )
    ]
    assert len(vector) == 1536
    assert math.isclose(sum(value * value for value in vector), 1.0)


def test_missing_embedding_provider_key_is_rejected(monkeypatch) -> None:
    monkeypatch.setattr(client.get_settings(), "EMBEDDINGS_PROVIDER", "gemini")
    monkeypatch.setattr(client.get_settings(), "GEMINI_API_KEY", "")

    with pytest.raises(RuntimeError, match="GEMINI_API_KEY is required"):
        client.embed_documents(["refund policy"])


def test_unsupported_embedding_provider_is_rejected(monkeypatch) -> None:
    monkeypatch.setattr(client.get_settings(), "EMBEDDINGS_PROVIDER", "unknown")

    with pytest.raises(RuntimeError, match="Unsupported EMBEDDINGS_PROVIDER"):
        client.embed_query("refund policy")


def test_provider_dimension_mismatch_is_rejected(monkeypatch) -> None:
    class FakeEmbeddings(FakeGeminiEmbeddings):
        def embed_documents(self, texts, **kwargs):
            return [[0.1]]

    monkeypatch.setattr(client, "GoogleGenerativeAIEmbeddings", FakeEmbeddings)
    monkeypatch.setattr(client.get_settings(), "EMBEDDINGS_PROVIDER", "gemini")
    monkeypatch.setattr(client.get_settings(), "GEMINI_API_KEY", "test-key")

    with pytest.raises(RuntimeError, match="1536 dimensions"):
        client.embed_documents(["refund policy"])


def test_openai_embeddings_remain_supported(monkeypatch) -> None:
    calls: list[list[str]] = []

    class FakeOpenAIEmbeddings:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs

        def embed_documents(self, texts):
            calls.append(texts)
            return [[0.1] * 1536 for _ in texts]

    monkeypatch.setattr(client, "OpenAIEmbeddings", FakeOpenAIEmbeddings)
    monkeypatch.setattr(client.get_settings(), "EMBEDDINGS_PROVIDER", "openai")
    monkeypatch.setattr(client.get_settings(), "OPENAI_API_KEY", "test-key")

    vectors = client.embed_documents(["refund policy"])

    assert calls == [["refund policy"]]
    assert len(vectors[0]) == 1536


def test_rate_limit_retries_without_exposing_provider_error(monkeypatch) -> None:
    class FakeEmbeddings(FakeGeminiEmbeddings):
        def __init__(self, **kwargs) -> None:
            super().__init__(**kwargs)
            self.calls = 0

        def embed_query(self, text, **kwargs):
            self.calls += 1
            if self.calls < 3:
                raise RuntimeError("429 RESOURCE_EXHAUSTED")
            return super().embed_query(text, **kwargs)

    monkeypatch.setattr(client, "GoogleGenerativeAIEmbeddings", FakeEmbeddings)
    monkeypatch.setattr(client.get_settings(), "EMBEDDINGS_PROVIDER", "gemini")
    monkeypatch.setattr(client.get_settings(), "GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(client.time, "sleep", lambda _seconds: None)

    vector = client.embed_query("refund policy")

    assert len(vector) == 1536
    assert FakeGeminiEmbeddings.instances[-1].calls == 3

def test_rate_limit_retries_are_bounded() -> None:
    attempts = 0

    def always_rate_limited():
        nonlocal attempts
        attempts += 1
        raise RuntimeError("429 RESOURCE_EXHAUSTED")

    with pytest.raises(client.EmbeddingUnavailableError):
        client._call_with_retry(always_rate_limited, max_attempts=3, base_delay=0)

    assert attempts == 3
