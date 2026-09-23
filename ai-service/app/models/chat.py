from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    conversation_id: str
    message: str = Field(min_length=1, max_length=10_000)


class ChatResponse(BaseModel):
    content: str
    confidence: float | None = None
    grounded: bool | None = None
    should_escalate: bool = False
