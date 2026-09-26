"""
Mints single-use Gemini Live credentials for the browser.

The Live API is a bidirectional WebSocket, and a Next.js route handler cannot
proxy a `101 Switching Protocols` upgrade. So the browser connects to Google
directly — which is what this module makes safe.

A Gemini Live session is opened with an **ephemeral token** rather than the API
key. The token is:

  * short-lived (`live_token_ttl_seconds`, minutes not days),
  * single-use (`uses: 1`), so a leaked token buys exactly one session and
    cannot be replayed,
  * scoped to a fresh session (`newSessionExpireTime`, ~2 minutes) even though
    the token itself lives longer, so a token that outlives the handshake is
    still worthless.

The API key therefore never reaches the browser, and neither does
`AI_API_URL` — consistent with the rest of this service, where the key stays
here and the Next app proxies everything else.

Deliberately `httpx` against the documented REST endpoint, like `gemini.py`:
one dependency we already need, and it keeps the request shape auditable. The
WS URL is *derived* from `gemini_base_url` rather than hardcoded, so moving the
service to `v1alpha` is a config change and not a code change.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

from .config import Settings

log = logging.getLogger(__name__)


class LiveTokenError(RuntimeError):
    """The token could not be minted. Carries a message safe to show a user."""


@dataclass(frozen=True)
class LiveGrant:
    """Everything the browser needs to open one Live session, and nothing more."""

    token: str
    expires_at: datetime
    model: str
    ws_url: str


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def live_ws_url(base_url: str, token: str) -> str:
    """
    Build the `BidiGenerateContentConstrained` WebSocket URL for a token.

    Derived from the REST base URL so the API version lives in one place:

        https://generativelanguage.googleapis.com/v1beta
        wss://generativelanguage.googleapis.com/ws/
          google.ai.generativelanguage.v1beta.GenerativeService
          .BidiGenerateContentConstrained?access_token=...

    The `...Constrained` service is the one that accepts an `access_token`; the
    plain `BidiGenerateContent` service takes the raw `?key=` instead, which is
    exactly what we must not hand a browser.
    """
    parsed = urlparse(base_url)
    host = parsed.netloc
    version = parsed.path.strip("/")
    service = "google.ai.generativelanguage"
    if version:
        service = f"{service}.{version}"
    return (
        f"wss://{host}/ws/{service}.GenerativeService"
        f".BidiGenerateContentConstrained?access_token={token}"
    )


class GeminiLive:
    """Single-method client for `POST /auth_tokens`. Fakeable in tests."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "GeminiLive":
        # A shorter timeout than `gemini.py`'s: this is one small REST call that
        # must not hold a person waiting on a microphone permission prompt. It
        # shares no client with text generation, so a slow generateContent can
        # never delay a voice handshake.
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(min(self._settings.gemini_timeout_seconds, 15.0)),
            headers={"Content-Type": "application/json"},
        )
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def mint(self) -> LiveGrant:
        """
        Mint one short-lived Live token.

        Raises `LiveTokenError` on every failure. The message is written for a
        log and for a person falling back to text chat — it never contains the
        API key or the token, and never echoes a raw upstream body, which is the
        same discipline `gemini.py` applies to its own errors.
        """
        if not self._settings.has_gemini_key:
            raise LiveTokenError(
                "GEMINI_API_KEY is not configured on the backend, so voice is "
                "unavailable. Text chat still works."
            )
        if self._client is None:
            raise LiveTokenError("Live client used outside of its context manager.")

        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(seconds=self._settings.live_token_ttl_seconds)
        body = {
            # One use. A single-use token is the difference between a leaked
            # credential that buys a single session and one that buys unlimited
            # ones for its whole lifetime.
            "uses": 1,
            "expireTime": _iso(expires_at),
            # The *session* dies quickly even though the token lives longer, so
            # a token captured before a handshake cannot be used after one.
            "newSessionExpireTime": _iso(
                now + timedelta(seconds=self._settings.live_session_ttl_seconds)
            ),
        }

        url = f"{self._settings.gemini_base_url}/auth_tokens"
        assert self._client is not None  # guarded above
        try:
            response = await self._client.post(
                url,
                headers={"x-goog-api-key": self._settings.gemini_api_key},
                json=body,
            )
        except httpx.HTTPError as exc:
            # Deliberately logs the exception type and not `exc` in full: a
            # transport error can carry the request URL, and for some handlers
            # the request headers too.
            log.warning("live token transport error: %s", type(exc).__name__)
            raise LiveTokenError(
                "Could not reach Gemini to open a voice channel. Text chat still works."
            ) from exc

        if response.status_code != 200:
            log.warning(
                "live token -> HTTP %s %s",
                response.status_code,
                _safe_error_detail(response),
            )
            if response.status_code in (400, 401, 403, 404):
                raise LiveTokenError(
                    f"Gemini rejected the token request (HTTP {response.status_code}). "
                    "Check GEMINI_API_KEY and GEMINI_LIVE_MODEL."
                )
            raise LiveTokenError(
                "Gemini is unavailable for voice right now. Text chat still works."
            )

        # `.json()` first, guarded. A 200 whose body is not JSON — an HTML error
        # page from an intermediary, an empty body, a truncated response — raised
        # `json.JSONDecodeError` straight out of here, and the caller sees a 500
        # from a bug-shaped stack trace rather than the 502 "voice is unavailable,
        # text chat still works" that is the truth. A decode failure on a
        # successful mint is an upstream problem, so it is reported as one.
        try:
            payload = response.json()
        except ValueError as exc:
            log.warning("live token -> 200 with a body that is not JSON")
            raise LiveTokenError(
                "Gemini returned an unreadable voice token. Text chat still works."
            ) from exc
        if not isinstance(payload, dict):
            log.warning("live token -> 200 with a JSON %s at the top level", type(payload).__name__)
            raise LiveTokenError(
                "Gemini returned an unusable voice token. Text chat still works."
            )

        token = _read_token(payload)
        if not token:
            log.warning("live token -> response contained no token")
            raise LiveTokenError(
                "Gemini returned an unusable voice token. Text chat still works."
            )

        model = self._settings.gemini_live_model
        log.info("live token minted for %s (expires %s)", model, _iso(expires_at))
        return LiveGrant(
            token=token,
            expires_at=expires_at,
            model=model,
            ws_url=live_ws_url(self._settings.gemini_base_url, token),
        )


def _read_token(payload: dict[str, Any]) -> str:
    """
    Pull the token out of the response.

    The field is `name`, not `token` — the value is a resource name, and reading
    it as `token` is the obvious first mistake here.
    """
    value = payload.get("name")
    return value.strip() if isinstance(value, str) else ""


def _safe_error_detail(response: httpx.Response) -> str:
    """Upstream message for the log, truncated, never key or token material."""
    try:
        payload = response.json()
    except ValueError:
        return ""
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error")
    if not isinstance(error, dict):
        return ""
    message = error.get("message")
    return str(message)[:300] if message is not None else ""
