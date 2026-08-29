from fastapi import APIRouter

from app.api.deps import DatabaseDep, SettingsDep
from app.schemas.health import CheckResult, LivenessResponse, ReadinessResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live", response_model=LivenessResponse, summary="Liveness probe")
async def live() -> LivenessResponse:
    """Answers only "is the process running". Never touches a dependency, so
    a database blip cannot cause the orchestrator to kill healthy tasks."""
    return LivenessResponse()


@router.get("/ready", response_model=ReadinessResponse, summary="Readiness probe")
async def ready(settings: SettingsDep, database: DatabaseDep) -> ReadinessResponse:
    """Reports dependency health. Returns 200 with ``status: degraded`` rather
    than an error status so the payload is always readable by a client."""
    checks: dict[str, CheckResult] = {}

    if not database.configured:
        checks["database"] = CheckResult(status="skipped", detail="not configured")
    else:
        healthy, detail = await database.healthy()
        checks["database"] = CheckResult(
            status="ok" if healthy else "error", detail=detail
        )

    checks["supabase"] = CheckResult(
        status="ok" if settings.supabase_url else "skipped",
        detail=None if settings.supabase_url else "not configured",
    )

    degraded = any(check.status == "error" for check in checks.values())

    return ReadinessResponse(
        status="degraded" if degraded else "ok",
        service=settings.service_name,
        version=settings.version,
        environment=settings.environment.value,
        checks=checks,
    )
