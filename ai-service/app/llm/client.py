from langchain_openai import ChatOpenAI

from app.core.config import get_settings

settings = get_settings()


def get_llm() -> ChatOpenAI:
    provider = settings.LLM_PROVIDER.lower()

    if provider == "deepseek":
        return ChatOpenAI(
            model="deepseek-chat",
            api_key=settings.DEEPSEEK_API_KEY,
            base_url=settings.DEEPSEEK_BASE_URL.rstrip("/") + "/v1",
            temperature=0,
        )

    return ChatOpenAI(
        model="gpt-4o-mini",
        api_key=settings.OPENAI_API_KEY,
        temperature=0,
    )
