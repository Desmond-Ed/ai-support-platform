import logging

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.embeddings.client import embedding_configuration_error
from app.llm.client import llm_configuration_error

router = APIRouter()
settings = get_settings()
logger = logging.getLogger(__name__)


@router.get("/health")
def health_check() -> dict[str, str]:
    """
    Liveness probe. Dependency-free by design - mirrors the Node backend's
    /api/health so Docker/Render have a consistent shape to poll across
    both services.
    """
    return {"status": "ok", "service": "ai-service"}


@router.get("/ready")
def readiness_check() -> dict[str, object]:
    checks = {
        "database": False,
        "pgvector": False,
        "llm_config": llm_configuration_error() is None,
        "embeddings_config": embedding_configuration_error() is None,
    }

    if settings.DATABASE_URL:
        try:
            import psycopg

            with psycopg.connect(settings.DATABASE_URL) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    checks["database"] = cur.fetchone() is not None

                    cur.execute(
                        "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')"
                    )
                    row = cur.fetchone()
                    checks["pgvector"] = bool(row and row[0])
        except Exception as exc:
            logger.warning(
                "Readiness database check failed",
                extra={"error_type": type(exc).__name__},
            )

    if all(checks.values()):
        return {"status": "ready", "checks": checks}

    raise HTTPException(
        status_code=503,
        detail={"status": "not_ready", "checks": checks},
    )
