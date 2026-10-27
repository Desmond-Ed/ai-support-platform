import logging
from typing import Any

logger = logging.getLogger("ai-service.metrics")


def usage_and_cost(response: Any, input_rate: float, output_rate: float) -> dict[str, int | float]:
    usage = getattr(response, "usage_metadata", None)
    if not usage:
        metadata = getattr(response, "response_metadata", None)
        usage = metadata.get("token_usage", {}) if isinstance(metadata, dict) else {}
    usage = usage or {}
    input_tokens = int(usage.get("input_tokens", usage.get("prompt_tokens", 0)) or 0)
    output_tokens = int(usage.get("output_tokens", usage.get("completion_tokens", 0)) or 0)
    cost = (input_tokens * input_rate + output_tokens * output_rate) / 1_000_000
    result = {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "estimated_cost_usd": round(cost, 8),
    }
    logger.info("llm_usage", extra=result)
    return result