from fastapi.testclient import TestClient

from app.api import chat as chat_api
from app.main import app
from app.retrieval.service import RetrievalError


class FakeResponse:
    def __init__(self, content: str):
        self.content = content


class FakeLLM:
    def __init__(self, content: str):
        self.content = content
        self.calls = 0

    async def ainvoke(self, messages):
        self.calls += 1
        return FakeResponse(self.content)


def test_chat_does_not_call_llm_when_no_chunk_passes_threshold(monkeypatch):
    monkeypatch.setattr(chat_api, "retrieve_context", lambda query, limit=4: [])

    def fail_if_called():
        raise AssertionError("LLM must not be called without verified context")

    monkeypatch.setattr(chat_api, "get_llm", fail_if_called)

    response = TestClient(app).post(
        "/api/chat",
        json={"conversation_id": "conversation-123", "message": "What is the policy?"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["content"] == "I don't have verified information on that, a human agent will follow up"
    assert payload["grounded"] is False
    assert payload["should_escalate"] is True
    assert payload["input_tokens"] == 0
    assert payload["output_tokens"] == 0
    assert payload["sources"] == []


def test_chat_returns_503_when_retrieval_fails(monkeypatch):
    def fail_retrieval(query, limit=4):
        raise RetrievalError("database unavailable")

    monkeypatch.setattr(chat_api, "retrieve_context", fail_retrieval)
    llm = FakeLLM("This should never be generated")
    monkeypatch.setattr(chat_api, "get_llm", lambda: llm)

    response = TestClient(app).post(
        "/api/chat",
        json={"conversation_id": "conversation-456", "message": "What is the policy?"},
    )

    assert response.status_code == 503
    assert llm.calls == 0


def test_chat_returns_sources_and_top_retrieval_similarity(monkeypatch):
    contexts = [
        {
            "chunk_id": "chunk-1",
            "document_id": "doc-1",
            "title": "Refunds and Returns",
            "content": "Refunds are processed within 5 business days.",
            "similarity": 0.92,
        },
        {
            "chunk_id": "chunk-2",
            "document_id": "doc-2",
            "title": "Shipping and Delivery",
            "content": "Tracking details are sent after dispatch.",
            "similarity": 0.81,
        },
    ]
    monkeypatch.setattr(chat_api, "retrieve_context", lambda query, limit=4: contexts)
    monkeypatch.setattr(
        chat_api,
        "get_llm",
        lambda: FakeLLM("Refunds are processed within 5 business days."),
    )

    response = TestClient(app).post(
        "/api/chat",
        json={"conversation_id": "conversation-789", "message": "When are refunds processed?"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["confidence"] == 0.92
    assert payload["sources"] == [
        {key: item[key] for key in ("chunk_id", "document_id", "title", "similarity")}
        for item in contexts
    ]


def test_chat_escalates_when_answer_only_shares_stopwords(monkeypatch):
    contexts = [
        {
            "chunk_id": "chunk-1",
            "document_id": "doc-1",
            "title": "Refunds and Returns",
            "content": "The policy is for and with the customer.",
            "similarity": 0.9,
        },
    ]
    monkeypatch.setattr(chat_api, "retrieve_context", lambda query, limit=4: contexts)
    monkeypatch.setattr(chat_api, "get_llm", lambda: FakeLLM("The plan is for and with support."))

    response = TestClient(app).post(
        "/api/chat",
        json={"conversation_id": "conversation-101", "message": "Tell me the policy"},
    )

    assert response.status_code == 200
    assert response.json()["grounded"] is False
    assert response.json()["should_escalate"] is True


def test_chat_does_not_escalate_well_supported_answer(monkeypatch):
    contexts = [
        {
            "chunk_id": "chunk-1",
            "document_id": "doc-1",
            "title": "Refunds and Returns",
            "content": "Refunds are processed within 5 business days after approval.",
            "similarity": 0.88,
        },
    ]
    monkeypatch.setattr(chat_api, "retrieve_context", lambda query, limit=4: contexts)
    monkeypatch.setattr(
        chat_api,
        "get_llm",
        lambda: FakeLLM("Refunds are processed within 5 business days after approval."),
    )

    response = TestClient(app).post(
        "/api/chat",
        json={"conversation_id": "conversation-202", "message": "When are refunds processed?"},
    )

    assert response.status_code == 200
    assert response.json()["grounded"] is True
    assert response.json()["should_escalate"] is False
