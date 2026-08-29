from typing import Literal

from pydantic import BaseModel, Field


class CheckResult(BaseModel):
    status: Literal["ok", "error", "skipped"]
    detail: str | None = None


class LivenessResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ReadinessResponse(BaseModel):
    status: Literal["ok", "degraded"]
    service: str
    version: str
    environment: str
    checks: dict[str, CheckResult] = Field(default_factory=dict)
