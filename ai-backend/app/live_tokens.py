"""
Mints short-lived Gemini Live tokens so the browser can open a voice socket.

**Why this exists at all.** Next.js route handlers cannot proxy a WebSocket,
so the browser has to hold the connection itself. It must not hold the API key
either. An ephemeral token is the narrow thing in between: a single-use
credential, valid for minutes, that authorises exactly one Live session and
cannot touch `generateContent`, the ticket tables, or any other surface.

**Why this is not in `gemini.py`.** That module is a `generateContent` client
on `v1beta` with a deliberate no-SDK fallback chain across models. The Live API
is a different protocol on a different version with a different failure model,
so it gets its own module rather than a mode flag on a class that is already
doing something else.

**What was verified against the live service** (not read off a doc page — the
docs are wrong in three places, see `live_prompts.py`):

  * the request field is `bidiGenerateContentSetup`, not `liveConnectConstraints`
  * `proactivity` exists on v1alpha only; v1beta rejects the whole request
  * `expireTime` has a hard 20 hour maximum
  * a single-use token can still be used to *resume* a session, so
    `uses: 1` costs nothing against the resumption path
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from .config import Settings
from .live_prompts import live_connect_setup, ws_url

log = logging.getLogger(__name__)


class LiveTokenError(RuntimeError):
    """Could not mint a Live token. Message is safe to log and to show."""


@dataclass(frozen=True)
class LiveToken:
    """What the browser needs to open a socket, and nothing more."""

    ws_url: str
    token: str
    expires_at: datetime


async def mint_live_token(settings: Settings) -> LiveToken:
    """
    Mint one single-use Live token with our session config pinned into it.

    Raises `LiveTokenError` — never a bare httpx exception — so the router can
    turn a Gemini problem into a 503 the UI renders as "voice unavailable,
    use text", rather than a 500 that looks like our own bug.
    """
    if not settings.has_gemini_key:
        raise LiveTokenError("GEMINI_API_KEY is not configured on the backend.")

    now = datetime.now(tz=timezone.utc)
    ttl = max(60, min(settings.gemini_live_token_ttl_seconds, 19 * 3600))
    body: dict[str, Any] = {
        # Resuming a session does not consume a use, verified live, so
        # `uses: 1` does not break the reconnect path.
        "uses": 1,
        "expireTime": _iso(now + timedelta(seconds=ttl)),
        "newSessionExpireTime": _iso(now + timedelta(seconds=60)),
        "bidiGenerateContentSetup": live_connect_setup(settings),
    }

    url = (
        f"https://generativelanguage.googleapis.com/"
        f"{settings.gemini_live_api_version}/auth_tokens"
    )

    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(settings.gemini_live_token_timeout_seconds)
        ) as client:
            response = await client.post(
                url,
                headers={
                    "x-goog-api-key": settings.gemini_api_key,
                    "Content-Type": "application/json",
                },
                json=body,
            )
    except httpx.HTTPError as exc:
        log.warning("live token transport error: %s: %s", type(exc).__name__, exc)
        raise LiveTokenError("Gemini Live is unreachable right now.") from exc

    if response.status_code != 200:
        # Log the upstream reason (never the key), return something a caller
        # can act on. A 400 here is almost always a bad field name in
        # `live_connect_setup`, which is a bug, not a user error.
        log.warning(
            "live token -> HTTP %s %s",
            response.status_code,
            _safe_detail(response),
        )
        raise LiveTokenError(
            f"Gemini rejected the Live token request (HTTP {response.status_code})."
        )

    try:
        name = response.json()["name"]
    except (ValueError, KeyError, TypeError) as exc:
        log.warning("live token -> malformed response body")
        raise LiveTokenError("Gemini returned an unreadable Live token.") from exc

    if not isinstance(name, str) or not name:
        raise LiveTokenError("Gemini returned an empty Live token.")

    # Gemini accepts an unknown voice name and silently substitutes a default,
    # so the name we asked for is the only record of what we intended.
    log.info(
        "live token minted model=%s voice=%s ttl=%ss",
        settings.gemini_live_model,
        settings.gemini_live_voice,
        ttl,
    )
    return LiveToken(
        ws_url=ws_url(settings, name),
        token=name,
        expires_at=now + timedelta(seconds=ttl),
    )


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_detail(response: httpx.Response) -> str:
    """Upstream message for the log, without risking key material."""
    try:
        return str(response.json().get("error", {}).get("message", ""))[:300]
    except ValueError:
        return ""


async def warm_up(settings: Settings) -> None:  # pragma: no cover - diagnostics
    """Cheap handshake probe for the CLI, not for request handling."""
    await mint_live_token(settings)
    await asyncio.sleep(0)
