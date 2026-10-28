import logging

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings

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
        "embeddings_key": bool(settings.OPENAI_API_KEY),
    }

    if settings.DATABASE_URL:
        try:
            import psycopg

            with psycopg.connect(settings.DATABASE_URL) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    checks["database"] = cur.fetchone() is not None
        except Exception:
            logger.exception("Readiness database check failed")

    if all(checks.values()):
        return {"status": "ready", "checks": checks}

    raise HTTPException(
        status_code=503,
        detail={"status": "not_ready", "checks": checks},
    )
