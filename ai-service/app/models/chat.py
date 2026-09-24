from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    conversation_id: str
    message: str = Field(min_length=1, max_length=10_000)


class ChatResponse(BaseModel):
    content: str
    confidence: float | None = None
    grounded: bool | None = None
    should_escalate: bool = False
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost_usd: float = 0.0
