from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
def health_check() -> dict[str, str]:
    """
    Liveness probe. Dependency-free by design — mirrors the Node backend's
    /api/health so Docker/Railway have a consistent shape to poll across
    both services.
    """
    return {"status": "ok", "service": "ai-service"}
