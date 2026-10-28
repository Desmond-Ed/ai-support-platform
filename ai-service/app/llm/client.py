import asyncio
import logging
from typing import Any

from langchain_openai import ChatOpenAI

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

LLM_MAX_ATTEMPTS = 3
LLM_RETRY_BASE_DELAY_SECONDS = 1.0


RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504, 529}


class LLMUnavailableError(RuntimeError):
    """Raised when a provider remains temporarily unavailable after retries."""


def _status_code(exc: Exception) -> int | None:
    status_code = getattr(exc, "status_code", None)
    if isinstance(status_code, int):
        return status_code
    response = getattr(exc, "response", None)
    response_status = getattr(response, "status_code", None)
    return response_status if isinstance(response_status, int) else None


def _is_retryable(exc: Exception) -> bool:
    status_code = _status_code(exc)
    if status_code is not None:
        return status_code in RETRYABLE_STATUS_CODES
    message = str(exc).upper()
    return any(
        marker in message
        for marker in ("429", "502", "503", "504", "529", "RESOURCE_EXHAUSTED")
    )


def llm_configuration_error() -> str | None:
    """Validate provider settings without constructing a client or calling out."""
    provider = settings.LLM_PROVIDER.strip().lower()

    if provider == "deepseek":
        missing = [
            name
            for name, value in (
                ("DEEPSEEK_API_KEY", settings.DEEPSEEK_API_KEY),
                ("DEEPSEEK_BASE_URL", settings.DEEPSEEK_BASE_URL),
                ("DEEPSEEK_MODEL", settings.DEEPSEEK_MODEL),
            )
            if not value
        ]
        return (
            f"{', '.join(missing)} required when LLM_PROVIDER=deepseek"
            if missing
            else None
        )

    if provider == "openai-compatible":
        missing = [
            name
            for name, value in (
                ("LLM_BASE_URL", settings.LLM_BASE_URL),
                ("LLM_API_KEY", settings.LLM_API_KEY),
                ("LLM_MODEL", settings.LLM_MODEL),
            )
            if not value
        ]
        return (
            f"{', '.join(missing)} required when LLM_PROVIDER=openai-compatible"
            if missing
            else None
        )

    if provider == "openai":
        if not settings.OPENAI_API_KEY:
            return "OPENAI_API_KEY is required when LLM_PROVIDER=openai"
        return None

    return f"Unsupported LLM_PROVIDER: {settings.LLM_PROVIDER}"


def get_llm() -> ChatOpenAI:
    error = llm_configuration_error()
    if error:
        raise RuntimeError(error)

    provider = settings.LLM_PROVIDER.lower()

    if provider == "deepseek":
        return ChatOpenAI(
            model=settings.DEEPSEEK_MODEL,
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=settings.DEEPSEEK_BASE_URL.rstrip("/"),
            temperature=0,
            max_retries=0,
        )

    if provider == "openai-compatible":
        missing = [
            name
            for name, value in (
                ("LLM_BASE_URL", settings.LLM_BASE_URL),
                ("LLM_API_KEY", settings.LLM_API_KEY),
                ("LLM_MODEL", settings.LLM_MODEL),
            )
            if not value
        ]
        if missing:
            raise RuntimeError(
                f"{', '.join(missing)} required when LLM_PROVIDER=openai-compatible"
            )
        return ChatOpenAI(
            model=settings.LLM_MODEL,
            api_key=settings.LLM_API_KEY,
            base_url=settings.LLM_BASE_URL.rstrip("/"),
            temperature=0,
            max_retries=0,
        )

    if provider != "openai":
        raise RuntimeError(f"Unsupported LLM_PROVIDER: {settings.LLM_PROVIDER}")

    kwargs: dict[str, Any] = {
        "model": "gpt-4o-mini",
        "api_key": settings.OPENAI_API_KEY,
        "temperature": 0,
        "max_retries": 0,
    }
    if settings.OPENAI_BASE_URL:
        kwargs["base_url"] = settings.OPENAI_BASE_URL
    return ChatOpenAI(**kwargs)


async def invoke_with_retry(
    llm: ChatOpenAI,
    messages: list[Any],
    *,
    max_attempts: int = LLM_MAX_ATTEMPTS,
    base_delay: float = LLM_RETRY_BASE_DELAY_SECONDS,
) -> Any:
    for attempt in range(1, max_attempts + 1):
        try:
            return await llm.ainvoke(messages)
        except Exception as exc:
            if not _is_retryable(exc):
                raise
            if attempt >= max_attempts:
                raise LLMUnavailableError(
                    "AI provider retries exhausted"
                ) from exc
            delay = base_delay * (2 ** (attempt - 1))
            logger.warning(
                "LLM provider temporarily unavailable; retrying",
                extra={"attempt": attempt, "max_attempts": max_attempts, "delay": delay},
            )
            await asyncio.sleep(delay)

    raise LLMUnavailableError("AI provider retries exhausted")
