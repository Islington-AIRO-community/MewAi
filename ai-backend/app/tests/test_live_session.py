"""`POST /api/live/session` — mint one short-lived Gemini Live token.

The token is what the browser hands to Gemini instead of the API key, so every
assertion here is about what that token may and may not do.

Run with `.venv/bin/python -m pytest app/tests -q`.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.config import Settings
from app.gemini_live import GeminiLive, LiveGrant, LiveTokenError, live_ws_url
from app.routers import live as live_router
from app.schemas import LiveSessionResponse

KEY = "test-gemini-key"


class FakeLive:
    """Stands in for `GeminiLive`, in the house duck-typed style."""

    def __init__(self, grant: LiveGrant | None = None, error: Exception | None = None) -> None:
        self.grant = grant
        self.error = error
        self.calls = 0

    async def mint(self) -> LiveGrant:
        self.calls += 1
        if self.error is not None:
            raise self.error
        assert self.grant is not None
        return self.grant


def make_request(live: FakeLive) -> object:
    return type("Req", (), {"app": type("A", (), {"state": type("S", (), {"live": live})()})()})()


def a_grant(**overrides) -> LiveGrant:
    base = {
        "token": "tok-123",
        "expires_at": datetime(2026, 9, 26, 6, 30, tzinfo=datetime.now().astimezone().tzinfo),
        "model": "gemini-3.8-live",
        "ws_url": "wss://example.test/ws?access_token=tok-123",
    }
    base.update(overrides)
    return LiveGrant(**base)


# --------------------------------------------------------------------------- #
# The WebSocket URL is derived, not hardcoded
# --------------------------------------------------------------------------- #


def test_the_ws_url_uses_the_constrained_service() -> None:
    url = live_ws_url("https://generativelanguage.googleapis.com/v1beta", "TOK")
    # The `...Constrained` service accepts an access_token. The plain
    # `BidiGenerateContent` service takes a raw `?key=`, which is precisely what
    # must never be handed to a browser.
    assert "BidiGenerateContentConstrained" in url
    assert "access_token=TOK" in url
    assert url.startswith("wss://")


def test_the_ws_url_does_not_carry_the_api_key() -> None:
    url = live_ws_url("https://generativelanguage.googleapis.com/v1beta", "TOK")
    assert "key=" not in url.replace("access_token=", "")


def test_the_api_version_is_read_from_the_base_url() -> None:
    v1beta = live_ws_url("https://generativelanguage.googleapis.com/v1beta", "T")
    v1alpha = live_ws_url("https://generativelanguage.googleapis.com/v1alpha", "T")
    assert "generativelanguage.v1beta." in v1beta
    assert "generativelanguage.v1alpha." in v1alpha


def test_a_base_url_with_a_trailing_path_still_builds() -> None:
    url = live_ws_url("https://host.example/v1beta/", "T")
    assert url.startswith("wss://host.example/ws/google.ai.generativelanguage.v1beta.")


# --------------------------------------------------------------------------- #
# Minting
# --------------------------------------------------------------------------- #


async def test_a_missing_key_is_a_user_readable_refusal(monkeypatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "")
    async with GeminiLive(Settings()) as live_client:
        with pytest.raises(LiveTokenError) as caught:
            await live_client.mint()
    assert "GEMINI_API_KEY" in str(caught.value)
    assert "Text chat still works" in str(caught.value)


async def test_a_missing_key_never_attempts_a_request(monkeypatch) -> None:
    """No key must mean no outbound call, not an outbound 401."""
    monkeypatch.setenv("GEMINI_API_KEY", "")

    def explode(*_a, **_k):  # pragma: no cover - must never run
        raise AssertionError("minted a token with no key configured")

    async with GeminiLive(Settings()) as live_client:
        client = live_client._client
        assert client is not None
        client.post = explode  # type: ignore[method-assign]
        with pytest.raises(LiveTokenError):
            await live_client.mint()


async def test_a_client_outside_its_context_is_refused() -> None:
    orphan = GeminiLive(Settings(gemini_api_key=KEY))
    with pytest.raises(LiveTokenError):
        await orphan.mint()


async def test_a_transport_failure_reads_as_unavailable() -> None:
    """A real `httpx` transport error, which is what actually escapes httpx."""

    class Boom:
        async def post(self, *_a, **_k):
            raise httpx.ConnectTimeout("connection reset")

        async def aclose(self) -> None:
            return None

    async with GeminiLive(Settings(gemini_api_key=KEY)) as live_client:
        live_client._client = Boom()  # type: ignore[assignment]
        with pytest.raises(LiveTokenError) as caught:
            await live_client.mint()
    assert "Text chat still works" in str(caught.value)


async def test_a_transport_error_is_not_logged_whole(caplog) -> None:
    """
    An exception message can carry the request URL and, for some handlers, the
    request headers. So the log gets the type and not the exception.
    """

    class Leaky:
        async def post(self, *_a, **_k):
            raise httpx.ConnectError(f"failed talking to {KEY}", request=None)

        async def aclose(self) -> None:
            return None

    with caplog.at_level(logging.WARNING, logger="app.gemini_live"):
        async with GeminiLive(Settings(gemini_api_key=KEY)) as live_client:
            live_client._client = Leaky()  # type: ignore[assignment]
            with pytest.raises(LiveTokenError):
                await live_client.mint()
    assert "ConnectError" in caplog.text
    assert KEY not in caplog.text


async def test_a_bad_key_is_reported_as_a_refusal() -> None:
    with pytest.raises(LiveTokenError) as caught:
        await mint_with(RecordingClient(status_code=403))
    # A 4xx will not fix itself on retry, so it names the thing to check.
    assert "GEMINI_API_KEY" in str(caught.value)


async def test_a_throttling_response_does_not_claim_the_key_is_wrong() -> None:
    with pytest.raises(LiveTokenError) as caught:
        await mint_with(RecordingClient(status_code=429))
    assert "GEMINI_API_KEY" not in str(caught.value)


async def test_a_200_without_a_token_is_still_a_failure() -> None:
    """The field is `name`, not `token`. Reading it wrong must not pass."""
    with pytest.raises(LiveTokenError):
        await mint_with(RecordingClient(payload={"nope": "tok-abc"}))


async def test_a_200_with_a_blank_token_is_still_a_failure() -> None:
    with pytest.raises(LiveTokenError):
        await mint_with(RecordingClient(payload={"name": "   "}))


async def test_a_200_with_an_unreadable_body_is_not_a_500() -> None:
    """
    The bug this pins: `.json()` on a 200 whose body is not JSON.

    An HTML error page from an intermediary, an empty body, a truncated response —
    all reachable in production and none of them a 200 from Gemini. Calling
    `.json()` unguarded let `json.JSONDecodeError` escape `mint()`, so the route
    answered 500 with a stack trace, and the browser read that as a bug in *our*
    code rather than as "voice is unavailable, type instead". A successful mint
    that cannot be parsed is an upstream problem, so it is reported as one.
    """
    with pytest.raises(LiveTokenError) as caught:
        await mint_with(RecordingClient(payload=NotJson()))
    assert "Text chat still works" in str(caught.value)


async def test_a_200_whose_json_is_not_an_object_is_also_refused() -> None:
    """`["tok-abc"]` has no `.get`, so a bare list would have been an
    `AttributeError` on the same path."""
    with pytest.raises(LiveTokenError):
        await mint_with(RecordingClient(payload=["tok-abc"]))


class NotJson:
    """A body that is not JSON at all, as an intermediary or a proxy can return."""

    def json(self):
        raise ValueError("Expecting value: line 1 column 1 (char 0)")


class FakeResponse:
    """Minimal stand-in for `httpx.Response`."""

    def __init__(self, status_code: int = 200, payload: dict | None = None) -> None:
        self.status_code = status_code
        self._payload = payload if payload is not None else {"name": "tok-abc"}

    def json(self) -> dict:
        return self._payload


class RecordingClient:
    """Captures the request instead of sending it. Doubles as its own closer."""

    def __init__(self, status_code: int = 200, payload: dict | None = None) -> None:
        self.status_code = status_code
        self.payload = payload if payload is not None else {"name": "tok-abc"}
        self.url = ""
        self.headers: dict[str, str] = {}
        self.body: dict | None = None

    async def post(self, url, *, headers, json):
        self.url = url
        self.headers = dict(headers)
        self.body = json
        return FakeResponse(self.status_code, self.payload)

    async def aclose(self) -> None:
        return None


async def mint_with(client, **settings_overrides) -> LiveGrant:
    async with GeminiLive(Settings(gemini_api_key=KEY, **settings_overrides)) as live_client:
        live_client._client = client  # type: ignore[assignment]
        return await live_client.mint()


async def test_the_token_is_single_use() -> None:
    """The single most important field: a leaked token buys one session."""
    client = RecordingClient()
    await mint_with(client)
    assert client.body is not None
    assert client.body["uses"] == 1


async def test_the_session_window_is_shorter_than_the_token_life() -> None:
    """A token captured before a handshake must be useless afterwards."""
    client = RecordingClient()
    await mint_with(client)
    assert client.body is not None
    parse = lambda v: datetime.strptime(v, "%Y-%m-%dT%H:%M:%SZ")  # noqa: E731
    assert parse(client.body["newSessionExpireTime"]) < parse(client.body["expireTime"])


async def test_the_key_travels_in_a_header_not_the_url() -> None:
    client = RecordingClient()
    await mint_with(client)
    assert KEY not in client.url
    assert client.headers["x-goog-api-key"] == KEY


async def test_the_expiry_formats_are_the_ones_google_expects() -> None:
    """No fractional seconds and a literal Z, or the endpoint 400s."""
    client = RecordingClient()
    await mint_with(client)
    assert client.body is not None
    # Each field lands roughly its own configured distance in the future. The
    # sign is the point: an expiry behind `now` would be a token that is dead on
    # arrival, which is the failure this assertion exists to catch.
    expected = {
        "expireTime": timedelta(minutes=30),
        "newSessionExpireTime": timedelta(minutes=2),
    }
    for field, want in expected.items():
        value = client.body[field]
        assert value.endswith("Z")
        assert "." not in value
        parsed = datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        remaining = parsed - datetime.now(timezone.utc)
        assert timedelta(seconds=want.total_seconds() - 60) < remaining <= want


async def test_a_successful_mint_returns_a_usable_grant() -> None:
    grant = await mint_with(RecordingClient(payload={"name": "  tok-padded  "}))
    assert grant.token == "tok-padded"
    assert grant.model == "gemini-3.8-live"
    assert "access_token=tok-padded" in grant.ws_url


# --------------------------------------------------------------------------- #
# The route
# --------------------------------------------------------------------------- #


async def test_the_route_returns_the_grant() -> None:
    fake = FakeLive(a_grant())
    result = await live_router.create_live_session(make_request(fake))
    assert isinstance(result, LiveSessionResponse)
    assert result.token == "tok-123"
    assert result.model == "gemini-3.8-live"
    assert fake.calls == 1


async def test_a_refusal_is_a_502_not_a_503() -> None:
    """
    503 means "the database is down and your ticket cannot be saved". Voice being
    unavailable is a different outage and collapsing them would send a reporter
    hunting for a data-loss problem that does not exist.
    """
    from fastapi import HTTPException

    fake = FakeLive(error=LiveTokenError("Gemini is unavailable for voice right now."))
    with pytest.raises(HTTPException) as caught:
        await live_router.create_live_session(make_request(fake))
    assert caught.value.status_code == 502
    assert "unavailable for voice" in str(caught.value.detail)


async def test_the_route_never_asks_who_is_calling() -> None:
    """
    `/chat` is deliberately ungated, so this must mint for an anonymous caller.
    A login wall in front of intake is the harm gating exists to avoid.
    """
    fake = FakeLive(a_grant())
    await live_router.create_live_session(make_request(fake))
    assert fake.calls == 1
