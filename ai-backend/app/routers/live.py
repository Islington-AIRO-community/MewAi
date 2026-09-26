"""`POST /api/live/session` — mint one short-lived Gemini Live token."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from ..gemini_live import GeminiLive, LiveTokenError
from ..schemas import LiveSessionResponse

log = logging.getLogger(__name__)

router = APIRouter(prefix="/live", tags=["live"])


@router.post(
    "/session",
    response_model=LiveSessionResponse,
    summary="Mint a single-use token for one Gemini Live voice session",
)
async def create_live_session(request: Request) -> LiveSessionResponse:
    """
    Hand the browser enough to open a Live WebSocket, and nothing more.

    **No session, no owner check.** `/chat` is deliberately ungated
    (`middleware.ts` matches only `/reports`, `/tickets` and `/admin`), because
    putting a Google round-trip in front of someone asking for help during a
    disaster is the harm that gating is supposed to avoid. Anonymous intake is
    therefore a real path here, and this endpoint must not become a way to
    require a login before someone can say they need rescuing.

    The credential is bounded instead: single-use, short-lived, and scoped to a
    session that has to start within ~2 minutes. That is what stands in for an
    identity check, and it is a weaker control — see the rate-limiting note in
    `gemini_live.py`.

    **502, not 503.** The two outages in this system are distinct and their
    copy is pinned. A 503 means "the ticket cannot be saved" — the database is
    down. A token failure means Gemini's auth endpoint is unhappy, and the
    honest thing to tell a reporter is that *voice* is starting unavailable,
    not that their report is lost. Collapsing them would send someone looking
    for a database problem that does not exist.
    """
    service: GeminiLive = request.app.state.live
    try:
        grant = await service.mint()
    except LiveTokenError as exc:
        log.warning("live session refused: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return LiveSessionResponse(
        token=grant.token,
        expires_at=grant.expires_at,
        model=grant.model,
        ws_url=grant.ws_url,
    )
