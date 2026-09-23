from fastapi.testclient import TestClient

from app.main import app
from app.api import chat as chat_api


class FakeResponse:
    def __init__(self, content: str):
        self.content = content


class FakeGroundedLLM:
    async def ainvoke(self, messages):
        return FakeResponse("Refunds are processed within 5 business days.")


class FakeUngroundedLLM:
    async def ainvoke(self, messages):
        return FakeResponse("I do not have enough verified information to answer this; please contact a human agent.")


def test_chat_uses_retrieval_and_marks_grounded(monkeypatch):
    monkeypatch.setattr(
        chat_api,
        "retrieve_context",
        lambda query, limit=4: [
            {"content": "Refunds are processed within 5 business days.", "similarity": 0.92},
        ],
    )
    monkeypatch.setattr(chat_api, "get_llm", lambda: FakeGroundedLLM())

    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={"conversation_id": "conversation-123", "message": "When do refunds arrive?"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["content"]
    assert payload["grounded"] is True
    assert payload["confidence"] > 0.5
    assert payload["should_escalate"] is False


def test_chat_escalates_when_no_relevant_context(monkeypatch):
    monkeypatch.setattr(chat_api, "retrieve_context", lambda query, limit=4: [])
    monkeypatch.setattr(chat_api, "get_llm", lambda: FakeUngroundedLLM())

    client = TestClient(app)
    response = client.post(
        "/api/chat",
        json={"conversation_id": "conversation-456", "message": "Tell me about the moon landing?"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["grounded"] is False
    assert payload["confidence"] == 0.0
    assert payload["should_escalate"] is True
