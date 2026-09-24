from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.evaluation.grounding import evaluate_grounding
from app.llm.client import get_llm
from app.models.chat import ChatRequest, ChatResponse
from app.observability.metrics import usage_and_cost
from app.retrieval.service import retrieve_context

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Generate a grounded reply for one customer message.

    This route retrieves the most relevant knowledge-base chunks when the
    database is available, builds a grounded prompt from those chunks, then
    evaluates the result for groundedness and escalation.
    """
    contexts = retrieve_context(request.message)
    grounded = bool(contexts)
    confidence = max((item.get("similarity", 0.0) for item in contexts), default=0.0)

    if grounded:
        context_text = "\n\n".join(item["content"] for item in contexts)
        system_prompt = (
            "You are a helpful support assistant. Answer using only the provided "
            "knowledge base context. If the context is insufficient or the answer "
            "is not present, explicitly say so and recommend a human agent."
        )
        user_prompt = (
            f"Knowledge base context:\n{context_text}\n\nQuestion:\n{request.message}"
        )
    else:
        system_prompt = (
            "You are a helpful support assistant. State clearly that you do not "
            "have enough verified information in the support knowledge base, and "
            "suggest a human agent should handle this request."
        )
        user_prompt = request.message

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
    grounded, confidence, should_escalate = evaluate_grounding(contexts, content)
    return ChatResponse(
        content=content,
        confidence=round(float(confidence), 4),
        grounded=grounded,
        should_escalate=should_escalate,
        input_tokens=int(usage["input_tokens"]),
        output_tokens=int(usage["output_tokens"]),
        estimated_cost_usd=float(usage["estimated_cost_usd"]),
    )
