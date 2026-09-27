"""
Health and readiness.

Two distinct questions, because they have different consequences:

  * `/api/health`   - is the process up? Always 200 so a container orchestrator
                      or the Next.js proxy can rely on it.
  * `/api/ready`    - can this process actually serve traffic? 503 when Gemini
                      has no key or Postgres is unreachable, so a failing
                      dependency is visible instead of surfacing as a failed
                      conversation.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
async def ready(request: Request, response: Response) -> dict[str, object]:
    settings = request.app.state.settings
    store = request.app.state.tickets

    checks = {
        "gemini_key": settings.has_gemini_key,
        "database_configured": settings.has_database,
        "database_connected": store.ready,
    }
    ok = all(checks.values())
    if not ok:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ready" if ok else "degraded",
        "checks": checks,
        "models": list(settings.gemini_models),
    }
