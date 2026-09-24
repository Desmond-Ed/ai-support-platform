from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Env-driven config. This service owns AI processing only — no app-state
    DB access (users/tickets/conversations live in Node/Postgres). DATABASE_URL
    here is used strictly for the pgvector knowledge-base tables (Phase 7).
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV: str = "development"
    PORT: int = 8000

    DATABASE_URL: str = ""
    REDIS_URL: str = ""

    # LLM provider — supported: "openai", "deepseek"
    LLM_PROVIDER: str = "openai"

    # OpenAI key — required when LLM_PROVIDER=openai
    OPENAI_API_KEY: str = ""

    # DeepSeek key — required when LLM_PROVIDER=deepseek
    DEEPSEEK_API_KEY: str = ""

    # DeepSeek base URL override (keep default unless self-hosting)
    DEEPSEEK_BASE_URL: str = "https://api.deepseek.com"
    LLM_INPUT_COST_PER_MILLION: float = 0.15
    LLM_OUTPUT_COST_PER_MILLION: float = 0.60

    # Node backend base URL, for any AI-service -> Node callbacks if ever needed.
    BACKEND_URL: str = "http://localhost:4000"

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:4000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
