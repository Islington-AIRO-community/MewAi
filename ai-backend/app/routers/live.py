"""
`POST /api/live/token` — mint a short-lived token for a voice session.

This endpoint is deliberately not a WebSocket proxy. It cannot be: Next.js
route handlers do not proxy WebSockets, and this service is on a private
network the browser cannot reach anyway. So the browser mints a token here and
then opens its own socket straight to Google.

What that means for this route's job: it is the only place in the system where
an anonymous visitor causes spend against the Gemini quota. It is cheap
(roughly a second of audio) but it is not free and there is no account to
attach it to, so the Next-side proxy rate-limits it. This side does not
duplicate that.

Status codes are the point of this module. A missing key or an unreachable
Gemini is a **503**, not a 500: 503 is the "come back later or use text"
signal the UI already knows how to render, whereas a 500 would read as a bug
in our own code. It must never degrade to a 200 with an empty token — a caller
that gets a 200 will try to open a socket with nothing to open it with.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request

from ..live_tokens import LiveTokenError, mint_live_token
from ..schemas import LiveTokenResponse

log = logging.getLogger(__name__)

router = APIRouter(prefix="/live", tags=["live"])


@router.post("/token", response_model=LiveTokenResponse)
async def post_live_token(request: Request) -> LiveTokenResponse:
    """Mint one single-use token for one voice session."""
    from ..config import get_settings  # local import keeps the module graph flat

    settings = getattr(request.app.state, "settings", None) or get_settings()

    try:
        minted = await mint_live_token(settings)
    except LiveTokenError as exc:
        log.warning("live token refused: %s", exc)
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return LiveTokenResponse(
        ws_url=minted.ws_url,
        token=minted.token,
        expires_at=minted.expires_at,
    )
