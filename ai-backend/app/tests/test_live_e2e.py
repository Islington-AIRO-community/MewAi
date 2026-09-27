"""
Opt-in end-to-end test against the real Gemini Live service.

## Why this exists and why it is skipped by default

Every rule the browser depends on — that `inputTranscription` is cumulative,
that `outputTranscription` is incremental, that a turn ends on `voiceActivity`
rather than `turnComplete` — was established by watching a real socket. None of
it is in a schema, and none of it can be made to happen on demand: a mock
reproduces whatever the test author already believed.

Those rules are now pinned in `lib/live-voice/session.test.ts` against
recorded envelopes. This module is the other half — it checks that the
*service* still honours them, and that our pinned token config is still
accepted, against a socket we did not control. When Gemini changes a default
silently, this is the test that notices; the TypeScript suite would keep
passing and the field would be the place it showed up.

## Running it

    FLARE_LIVE_E2E=1 .venv/bin/python -m pytest app/tests/test_live_e2e.py -q -s

It needs a real `GEMINI_API_KEY` in `ai-backend/.env` and spends quota — a
token mint plus a socket that lives a few seconds. The default run of the suite
never does this: `pytest app/tests -q` collects this module, skips it, and
touches no network. That property is the whole point, so do not "helpfully"
remove the guard.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import socket
from datetime import datetime, timezone
from typing import Any

import pytest

from ..config import Settings
from ..live_tokens import LiveTokenError, mint_live_token

# The whole file is inert unless explicitly asked for. `skipif` at module level
# is deliberate: it is evaluated at collection, so an unset env var costs
# nothing and cannot be defeated by a fixture quietly running anyway.
pytestmark = pytest.mark.skipif(
    os.getenv("FLARE_LIVE_E2E") != "1",
    reason="set FLARE_LIVE_E2E=1 to call the real Gemini Live service (spends quota)",
)

# A turn takes seconds to start and the model speaks at roughly realtime, so
# this is generous rather than tight. A slow pass is better than a flake that
# teaches people to ignore the test.
# Force IPv4 on the socket. Google's host publishes AAAA records, and on
# networks with no IPv6 route (sandboxes, some CI) the connection is accepted
# and then blackholed: asyncio picks the AAAA address from getaddrinfo and
# never falls back, so the handshake times out and the test reports a failure
# that looks exactly like a broken service. Browsers use happy-eyeballs, so the
# product is unaffected — this is purely about the test being able to reach a
# verdict. `AF_INET` is safe here; nothing about Live cares which family it
# arrives on.
SOCKET_FAMILY = socket.AF_INET

HANDSHAKE_TIMEOUT_S = 20.0
FIRST_EVENT_TIMEOUT_S = 30.0


def _settings() -> Settings:
    # Read from the repo's own .env rather than the ambient environment, so the
    # test behaves the same as the running service.
    return Settings()  # type: ignore[call-arg]


async def _collect_envelopes(socket: Any, *, until: int, timeout: float) -> list[dict[str, Any]]:
    """Read envelopes off an open socket until `until` of them have arrived."""
    received: list[dict[str, Any]] = []

    async def reader() -> None:
        while len(received) < until:
            raw = await asyncio.wait_for(socket.recv(), timeout=timeout)
            # Not always `str`. Dropping the binary frames made a healthy
            # handshake look like a silent service: `received` came back empty
            # and the test reported "setup did not complete".
            if isinstance(raw, (bytes, bytearray)):
                raw = raw.decode("utf-8", "replace")
            if isinstance(raw, str):
                received.append(json.loads(raw))

    try:
        await reader()
    except (asyncio.TimeoutError, asyncio.IncompleteReadError):
        pass
    return received


@pytest.mark.asyncio
async def test_mint_token_against_real_gemini() -> None:
    """The shipped mint path still gets a usable token from the real service."""
    settings = _settings()
    if not settings.has_gemini_key:
        pytest.skip("GEMINI_API_KEY is not configured")

    try:
        minted = await mint_live_token(settings)
    except LiveTokenError as exc:
        # A failure here is a real finding, not a flaky test: it means the
        # pinned api version or model name has been rejected or retired.
        pytest.fail(f"real token mint failed: {exc}")

    assert minted.ws_url.startswith("wss://"), "token must hand out a secure socket"
    # The key must never reach the browser, in any form, on any query param.
    assert "key=" not in minted.ws_url
    assert settings.gemini_api_key not in minted.ws_url
    assert minted.token
    assert minted.expires_at > datetime.now(tz=timezone.utc)


@pytest.mark.asyncio
async def test_real_socket_handshake_and_setup() -> None:
    """The pinned setup config is still accepted by the service."""
    websockets = pytest.importorskip("websockets")

    settings = _settings()
    if not settings.has_gemini_key:
        pytest.skip("GEMINI_API_KEY is not configured")

    try:
        minted = await mint_live_token(settings)
    except LiveTokenError as exc:
        pytest.fail(f"real token mint failed: {exc}")

    async with websockets.connect(
        minted.ws_url,
        open_timeout=HANDSHAKE_TIMEOUT_S,
        max_size=16 * 1024 * 1024,
        family=SOCKET_FAMILY,
    ) as socket:
        # Mirrors `lib/live-voice/session.ts` exactly, and that mirroring is the
        # point of this test. The client used to send a second, top-level
        # `realtimeInputConfig` frame; that is not a client message, the service
        # answered 1007 "Unknown name" and closed, and the reporter saw an
        # unexplained "voice unavailable". A test that sends anything the
        # browser does not send cannot catch that class of bug, so this stays
        # deliberately minimal: turn-taking is pinned in the token.
        await socket.send(json.dumps({"setup": {}}))

        received = await _collect_envelopes(socket, until=1, timeout=FIRST_EVENT_TIMEOUT_S)

    assert received, "service accepted the socket but sent nothing at all"
    # An error frame here means our pinned model/voice/api-version was refused.
    assert "error" not in received[0], f"service rejected the setup: {received[0]}"
    assert "setupComplete" in received[0], f"no setupComplete: {received[0]}"


@pytest.mark.asyncio
async def test_service_returns_audio_for_a_turn() -> None:
    """
    The only test that would have caught the bug that cost a debugging session.

    Everything else here can pass on a session that is connected, healthy and
    completely inert. This one sends input and requires audio *back*, so a
    client that speaks a field the service no longer reads fails instead of
    sitting in silence.

    `realtimeInput.mediaChunks` is deprecated. On v1beta the service rejects it
    by name; on v1alpha — the version we pin for `proactivity` — it accepts the
    frame and discards it, so the model hears nothing, never replies, and voice
    activity detection never fires. Nothing is logged on either side.
    """
    settings = Settings()
    websockets = pytest.importorskip("websockets")
    try:
        minted = await mint_live_token(settings)
    except LiveTokenError as exc:
        pytest.fail(f"real token mint failed: {exc}")

    audio_bytes = 0
    activity: list[str] = []
    transcript: list[str] = []

    async with websockets.connect(
        minted.ws_url,
        open_timeout=HANDSHAKE_TIMEOUT_S,
        max_size=32 * 1024 * 1024,
        family=SOCKET_FAMILY,
    ) as socket:
        # A text turn, because it is deterministic: no VAD, no microphone, and
        # it cannot be a false negative the way synthetic audio can.
        await socket.send(json.dumps({"setup": {}}))
        await asyncio.sleep(0.8)
        await socket.send(
            json.dumps(
                {
                    "realtimeInput": {
                        "text": "My roof has collapsed and I am trapped with my mother."
                    }
                }
            )
        )

        deadline = asyncio.get_running_loop().time() + 30.0
        while asyncio.get_running_loop().time() < deadline:
            try:
                raw = await asyncio.wait_for(socket.recv(), timeout=6.0)
            except asyncio.TimeoutError:
                break
            if isinstance(raw, (bytes, bytearray)):
                raw = raw.decode("utf-8", "replace")
            envelope = json.loads(raw)
            content = envelope.get("serverContent") or {}
            for part in (content.get("modelTurn") or {}).get("parts") or []:
                inline = part.get("inlineData") or {}
                if inline.get("data"):
                    audio_bytes += len(inline["data"])
            said = (content.get("outputTranscription") or {}).get("text")
            if said:
                transcript.append(said)
            if envelope.get("voiceActivity"):
                activity.append(json.dumps(envelope["voiceActivity"]))
            if content.get("turnComplete") and audio_bytes:
                break

    assert audio_bytes > 0, (
        "the model produced no audio: a connected session that never answers is "
        "what a deprecated realtime input field looks like"
    )
    assert transcript, "audio arrived with no output transcription"


@pytest.mark.asyncio
async def test_the_replies_are_nepali_even_when_spoken_to_in_english() -> None:
    """
    The one thing a system prompt can promise here, and the one thing nothing
    else in this repo can check.

    `test_the_live_prompt_pins_the_reply_language` in `test_live_tokens.py`
    asserts that the *words* asking for Nepali are still in the prompt. That is
    necessary and it is not sufficient: prompt instructions are requests, not
    guarantees, and the common failure is not disobeying the rule so much as
    the mirror reflex — a reporter who speaks English, or switches mid-call, and
    the model answers in kind for a turn or two before recovering.

    So the probe sends an English turn on purpose. An all-Nepali probe would
    pass even if the language rule had been deleted from the prompt, because the
    model would just mirror the caller — which is exactly the bug. Asserting on
    the *script* rather than the language is deliberate: "Nepali" as a word is
    ambiguous to a counter, whereas Devanagari in the output transcription is
    not, and a stray English word inside a Nepali sentence is the half-and-half
    case the prompt forbids.
    """
    settings = Settings()
    websockets = pytest.importorskip("websockets")
    try:
        minted = await mint_live_token(settings)
    except LiveTokenError as exc:
        pytest.fail(f"real token mint failed: {exc}")

    fragments: list[str] = []
    audio_bytes = 0

    async with websockets.connect(
        minted.ws_url,
        open_timeout=HANDSHAKE_TIMEOUT_S,
        max_size=32 * 1024 * 1024,
        family=SOCKET_FAMILY,
    ) as socket:
        await socket.send(json.dumps({"setup": {}}))
        await asyncio.sleep(0.8)
        # English, and about an emergency, so a model that ignores the language
        # rule has every reason to answer in English.
        await socket.send(
            json.dumps(
                {
                    "realtimeInput": {
                        "text": "Hello, I am trapped. Where are you? Please help."
                    }
                }
            )
        )

        deadline = asyncio.get_running_loop().time() + 30.0
        while asyncio.get_running_loop().time() < deadline:
            try:
                raw = await asyncio.wait_for(socket.recv(), timeout=6.0)
            except asyncio.TimeoutError:
                break
            if isinstance(raw, (bytes, bytearray)):
                raw = raw.decode("utf-8", "replace")
            content = (json.loads(raw).get("serverContent") or {})
            for part in (content.get("modelTurn") or {}).get("parts") or []:
                if (part.get("inlineData") or {}).get("data"):
                    audio_bytes += len(part["inlineData"]["data"])
            said = (content.get("outputTranscription") or {}).get("text")
            if said:
                fragments.append(said)
            if content.get("turnComplete") and audio_bytes:
                break

    assert audio_bytes > 0, "no audio, so there is no reply language to judge"
    said = "".join(fragments)
    assert said.strip(), "audio arrived with no output transcription"

    devanagari = [c for c in said if "ऀ" <= c <= "ॿ"]
    latin = [c for c in said if c.isascii() and c.isalpha()]

    assert len(devanagari) > 20, f"reply is not substantially Devanagari: {said!r}"
    assert len(latin) / max(len(devanagari), 1) < 0.15, (
        "the model mirrored the English caller, or drifted mid-sentence: "
        f"{said!r} ({len(latin)} latin letters against {len(devanagari)} devanagari)"
    )


@pytest.mark.asyncio
async def test_silence_does_not_end_the_turn() -> None:
    """
    Feeding continuous silence must not produce a `turnComplete`.

    This is the assumption the whole always-on design rests on: there is no
    "the reporter finished" frame, and the boundary is server VAD. If a service
    change made silence end turns, a paused reporter would have their
    conversation cut off mid-thought, repeatedly, in the middle of a
    disaster.
    """
    websockets = pytest.importorskip("websockets")

    settings = _settings()
    if not settings.has_gemini_key:
        pytest.skip("GEMINI_API_KEY is not configured")

    try:
        minted = await mint_live_token(settings)
    except LiveTokenError as exc:
        pytest.fail(f"real token mint failed: {exc}")

    async with websockets.connect(
        minted.ws_url,
        open_timeout=HANDSHAKE_TIMEOUT_S,
        max_size=16 * 1024 * 1024,
        family=SOCKET_FAMILY,
    ) as socket:
        await socket.send(json.dumps({"setup": {}}))
        received = await _collect_envelopes(socket, until=1, timeout=FIRST_EVENT_TIMEOUT_S)
        if not received or "setupComplete" not in received[0]:
            pytest.fail(f"setup did not complete: {received}")

        # 1 second of true digital silence, in ten 100 ms chunks (16 kHz, 16-bit
        # mono). One 16_000-sample chunk is a *whole* second, so sending twenty
        # of them pushed 20 seconds of audio into 1 second of wall time.
        silent_pcm = b"\x00\x00" * 1_600
        for _ in range(10):  # 1s total
            await socket.send(
                json.dumps(
                    {
                        "realtimeInput": {
                            "audio": {
                                "mimeType": "audio/pcm;rate=16000",
                                "data": base64.b64encode(silent_pcm).decode(),
                            }
                        }
                    }
                )
            )
            await asyncio.sleep(0.05)

        after_silence = await _collect_envelopes(
            socket, until=3, timeout=3.0
        )

    for envelope in after_silence:
        server_content = envelope.get("serverContent") or {}
        assert "turnComplete" not in server_content, (
            "silence ended the turn; the always-on session would cut the "
            f"reporter off: {envelope}"
        )
