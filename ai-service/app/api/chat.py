from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.evaluation.grounding import evaluate_grounding
from app.llm.client import get_llm
from app.models.chat import ChatRequest, ChatResponse
from app.observability.metrics import usage_and_cost
from app.retrieval.service import RetrievalError, retrieve_context

router = APIRouter()
NO_EVIDENCE_REFUSAL = "I don't have verified information on that, a human agent will follow up"


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Generate a grounded reply for one customer message.

    This route retrieves the most relevant knowledge-base chunks when the
    database is available, builds a grounded prompt from those chunks, then
    evaluates the result for groundedness and escalation.
    """
    try:
        contexts = retrieve_context(request.message)
    except RetrievalError as exc:
        raise HTTPException(status_code=503, detail="Knowledge retrieval unavailable") from exc

    if not contexts:
        return ChatResponse(
            content=NO_EVIDENCE_REFUSAL,
            confidence=0.0,
            grounded=False,
            should_escalate=True,
            input_tokens=0,
            output_tokens=0,
            estimated_cost_usd=0.0,
            sources=[],
        )

    confidence = max((item.get("similarity", 0.0) for item in contexts), default=0.0)

    context_text = "\n\n".join(item["content"] for item in contexts)
    system_prompt = (
        "You are a support assistant. Answer policy questions only with facts directly "
        "supported by the provided knowledge base context. Never invent, infer, or "
        "extend a policy. If evidence is insufficient, say so and recommend a human agent. "
        "Be concise. No greetings or closing pleasantries."
    )
    user_prompt = f"Knowledge base context:\n{context_text}\n\nQuestion:\n{request.message}"

    try:
        response = await get_llm().ainvoke(
            [
                ("system", system_prompt),
                ("user", user_prompt),
            ]
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail="AI service unavailable") from exc

    content = response.content if isinstance(response.content, str) else str(response.content)
    usage = usage_and_cost(
        response,
        get_settings().LLM_INPUT_COST_PER_MILLION,
        get_settings().LLM_OUTPUT_COST_PER_MILLION,
    )
    grounded, _answer_support, should_escalate = evaluate_grounding(
        contexts,
        content,
        get_settings().ANSWER_MIN_SUPPORT,
    )
    return ChatResponse(
        content=content,
        confidence=round(float(confidence), 4),
        grounded=grounded,
        should_escalate=should_escalate,
        input_tokens=int(usage["input_tokens"]),
        output_tokens=int(usage["output_tokens"]),
        estimated_cost_usd=float(usage["estimated_cost_usd"]),
        sources=[
            {
                "chunk_id": item["chunk_id"],
                "document_id": item["document_id"],
                "title": item["title"],
                "similarity": float(item["similarity"]),
            }
            for item in contexts
        ],
    )
