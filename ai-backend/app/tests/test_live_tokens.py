"""
Tests for the Live voice token handshake.

The wire contract here was verified against the live service rather than read
off a doc page, and the docs are wrong in ways that would each break this
feature silently. So these tests exist mostly to pin the facts that took an
outbound probe to establish:

  * the request field is `bidiGenerateContentSetup`, not `liveConnectConstraints`
  * `proactivity` is rejected by v1beta, so the version is pinned to v1alpha
  * the connect URL is the **Constrained** endpoint
  * a missing key is a 503, never a 200 with an empty token and never a 500

`httpx` is monkeypatched at the module boundary, so no network and no quota.
The tests that care about the *live* behaviour of the model — that an invalid
voice name is silently accepted, for instance — are documented in
`live_prompts.py` rather than asserted here, because asserting them would pin
a vendor quirk as if it were our contract.

    .venv/bin/python -m pytest app/tests -q
"""

from __future__ import annotations

import json

import httpx
import pytest
from fastapi import HTTPException

from app.config import Settings
from app.live_prompts import (
    LIVE_SYSTEM_INSTRUCTION,
    SPOKEN_UNRELIABLE_FIELDS,
    live_connect_setup,
    ws_url,
)
from app.live_tokens import LiveTokenError, mint_live_token
from app.routers import live as live_router

TOKEN_NAME = "auth_tokens/0123456789abcdef"


def settings(**over) -> Settings:
    base = {"gemini_api_key": "test-key", "database_url": "postgresql://x/y"}
    base.update(over)
    return Settings(**base)


class FakeResponse:
    def __init__(self, status_code: int, payload: dict | str) -> None:
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        if isinstance(self._payload, str):
            return json.loads(self._payload)
        return self._payload


def capture_post(monkeypatch, response: FakeResponse) -> list[dict]:
    """Swap the token mint's HTTP call. Returns the list of bodies it saw."""
    seen: list[dict] = []

    class FakeClient:
        def __init__(self, *a, **k) -> None:
            pass

        async def __aenter__(self) -> "FakeClient":
            return self

        async def __aexit__(self, *exc: object) -> None:
            return None

        async def post(self, url, headers=None, json=None):  # noqa: A002
            seen.append({"url": url, "headers": headers or {}, "body": json or {}})
            return response

    monkeypatch.setattr(httpx, "AsyncClient", FakeClient)
    return seen


# ---------------------------------------------------------------------- #
# The request we send
# ---------------------------------------------------------------------- #


async def test_the_setup_is_sent_as_bidi_generate_content_setup(monkeypatch):
    """
    The field name is the single most load-bearing literal in this feature.

    The docs and the SDK both call it `liveConnectConstraints`; the REST
    endpoint rejects that name outright with
    `Unknown name "liveConnectConstraints" at 'auth_token'`, and only
    `bidiGenerateContentSetup` is accepted.
    """
    seen = capture_post(monkeypatch, FakeResponse(200, {"name": TOKEN_NAME}))

    await mint_live_token(settings())

    body = seen[0]["body"]
    assert "bidiGenerateContentSetup" in body
    assert "liveConnectConstraints" not in body


async def test_the_api_version_is_v1alpha(monkeypatch):
    """
    v1alpha is pinned because it is the only version that accepts `proactivity`.

    Both versions open a working socket, so nothing else in this file would
    notice the regression — but v1beta answers the token request with
    `Unknown name "proactivity"`, which kills voice entirely rather than
    degrading it.
    """
    seen = capture_post(monkeypatch, FakeResponse(200, {"name": TOKEN_NAME}))

    await mint_live_token(settings())

    assert "/v1alpha/auth_tokens" in seen[0]["url"]
    assert "v1beta" not in seen[0]["url"]


async def test_proactive_audio_is_requested(monkeypatch):
    """
    The mitigation for an always-open microphone.

    Without it, a street conversation during an earthquake can trigger a reply
    to somebody else's voice — which would put words in a reporter's mouth
    that they never said, and those words get replayed into the ticket draft.
    """
    seen = capture_post(monkeypatch, FakeResponse(200, {"name": TOKEN_NAME}))

    await mint_live_token(settings())

    setup = seen[0]["body"]["bidiGenerateContentSetup"]
    assert setup["proactivity"] == {"proactiveAudio": True}


async def test_the_client_cannot_override_the_pinned_config(monkeypatch):
    """
    With `bidiGenerateContentSetup` set and no `field_mask`, the server takes
    the config entirely from the token and ignores the browser's setup message.
    Sending no `fieldMask` is therefore load-bearing: sending one would let a
    modified client choose which of these fields it overrides.
    """
    seen = capture_post(monkeypatch, FakeResponse(200, {"name": TOKEN_NAME}))

    await mint_live_token(settings())

    assert "fieldMask" not in seen[0]["body"]


async def test_resumption_and_compression_are_enabled_from_the_first_handshake(
    monkeypatch,
):
    """
    Both must be in the token, not a follow-up setup message.

    Audio runs about 25 tokens/second and a connection is capped near 10
    minutes, so a session that enables either one late — or not at all — dies
    mid-conversation with the reporter's words in it.
    """
    seen = capture_post(monkeypatch, FakeResponse(200, {"name": TOKEN_NAME}))

    await mint_live_token(settings())

    setup = seen[0]["body"]["bidiGenerateContentSetup"]
    assert setup["sessionResumption"] == {}
    assert setup["contextWindowCompression"] == {"slidingWindow": {"targetTokens": "8000"}}


async def test_both_transcriptions_are_on(monkeypatch):
    """
    `inputAudioTranscription` is the whole product: the transcript it produces
    is what gets replayed into the ticket draft. Without it the voice session
    records a conversation that is then thrown away.
    """
    seen = capture_post(monkeypatch, FakeResponse(200, {"name": TOKEN_NAME}))

    await mint_live_token(settings())

    setup = seen[0]["body"]["bidiGenerateContentSetup"]
    assert setup["inputAudioTranscription"] == {}
    assert setup["outputAudioTranscription"] == {}
    assert setup["generationConfig"]["responseModalities"] == ["AUDIO"]


async def test_the_token_is_single_use_with_a_bounded_lifetime(monkeypatch):
    """
    `uses: 1` is free with respect to resumption — the service documents that
    resuming a session does not consume a use, verified live — so this costs
    the reconnect path nothing. `expireTime` has a hard 20 hour ceiling and
    rejects anything beyond it.
    """
    seen = capture_post(monkeypatch, FakeResponse(200, {"name": TOKEN_NAME}))

    await mint_live_token(settings())

    body = seen[0]["body"]
    assert body["uses"] == 1

    expires = body["expireTime"].replace("Z", "+00:00")
    from datetime import datetime, timezone

    delta = datetime.fromisoformat(expires) - datetime.now(tz=timezone.utc)
    assert 0 < delta.total_seconds() <= 19 * 3600


async def test_the_key_is_never_sent_to_the_browser_body(monkeypatch):
    """The key goes in a header, and stays there."""
    seen = capture_post(monkeypatch, FakeResponse(200, {"name": TOKEN_NAME}))

    minted = await mint_live_token(settings(gemini_api_key="super-secret"))

    assert seen[0]["headers"]["x-goog-api-key"] == "super-secret"
    assert "super-secret" not in json.dumps(seen[0]["body"])
    assert "super-secret" not in minted.ws_url
    assert "super-secret" not in minted.token


# ---------------------------------------------------------------------- #
# What we hand back
# ---------------------------------------------------------------------- #


async def test_the_ws_url_is_the_constrained_endpoint(monkeypatch):
    """
    `BidiGenerateContentConstrained`, and `v1alpha` in the path.

    The unconstrained endpoint does not accept a token, and the pinned config
    above is only enforced here — so this string being wrong turns "the client
    cannot change our prompt" into "the client cannot connect at all".
    """
    capture_post(monkeypatch, FakeResponse(200, {"name": TOKEN_NAME}))

    minted = await mint_live_token(settings())

    assert "BidiGenerateContentConstrained" in minted.ws_url
    assert "v1alpha" in minted.ws_url
    assert minted.ws_url.startswith("wss://")
    assert TOKEN_NAME in minted.ws_url


def test_the_ws_url_is_built_without_a_leading_slash_in_the_service_name():
    """Guards the exact spelling, which is easy to break with a path join."""
    url = ws_url(settings(), TOKEN_NAME)

    assert "google.ai.generativelanguage.v1alpha.GenerativeService" in url
    assert "generativelanguage.googleapis.com//ws" not in url


# ---------------------------------------------------------------------- #
# Failure shapes
# ---------------------------------------------------------------------- #


async def test_a_missing_key_is_a_live_token_error_not_an_http_error():
    """
    The caller must be able to tell "we are not configured" from "Gemini is
    down", and neither may escape as a raw httpx exception.
    """
    with pytest.raises(LiveTokenError):
        await mint_live_token(settings(gemini_api_key=""))


async def test_a_rejected_request_never_returns_a_token(monkeypatch):
    """
    The dangerous outcome is a 200-shaped answer with nothing usable in it. A
    400 from the token endpoint almost always means a bad field name in
    `live_connect_setup`, which is our bug, so it must surface loudly.
    """
    capture_post(
        monkeypatch,
        FakeResponse(400, {"error": {"message": "Unknown name \"nope\""}}),
    )

    with pytest.raises(LiveTokenError):
        await mint_live_token(settings())


async def test_a_transport_failure_is_wrapped(monkeypatch):
    class Boom(httpx.AsyncClient):
        def __init__(self, *a, **k) -> None:
            pass

        async def __aenter__(self) -> "Boom":
            return self

        async def __aexit__(self, *exc: object) -> None:
            return None

        async def post(self, *a, **k):
            raise httpx.ConnectError("no route to host")

    monkeypatch.setattr(httpx, "AsyncClient", Boom)

    with pytest.raises(LiveTokenError):
        await mint_live_token(settings())


async def test_an_empty_token_is_refused(monkeypatch):
    """A 200 with an empty `name` must not become a socket nobody can open."""
    capture_post(monkeypatch, FakeResponse(200, {"name": ""}))

    with pytest.raises(LiveTokenError):
        await mint_live_token(settings())


# ---------------------------------------------------------------------- #
# The router
# ---------------------------------------------------------------------- #


class FakeRequest:
    def __init__(self, cfg: Settings) -> None:
        self.app = type("App", (), {"state": type("S", (), {"settings": cfg})()})()


async def test_the_router_returns_only_the_three_wire_fields(monkeypatch):
    """
    No key, no model name, no system prompt, no address of this service. The
    config is pinned into the token, so there is nothing here worth leaking and
    nothing here worth trusting from a caller.
    """
    capture_post(monkeypatch, FakeResponse(200, {"name": TOKEN_NAME}))

    body = await live_router.post_live_token(FakeRequest(settings()))

    assert set(body.model_dump()) == {"ws_url", "token", "expires_at"}
    assert body.token == TOKEN_NAME


async def test_a_missing_key_becomes_503_not_500(monkeypatch):
    """
    503 is the "try again or use text" signal the UI already knows how to
    render. A 500 would read as a bug in our own code, which is both wrong and
    less actionable for someone asking for help during a disaster.
    """
    with pytest.raises(HTTPException) as caught:
        await live_router.post_live_token(FakeRequest(settings(gemini_api_key="")))

    assert caught.value.status_code == 503


async def test_an_upstream_rejection_becomes_503(monkeypatch):
    capture_post(monkeypatch, FakeResponse(403, {"error": {"message": "bad key"}}))

    with pytest.raises(HTTPException) as caught:
        await live_router.post_live_token(FakeRequest(settings()))

    assert caught.value.status_code == 503


# ---------------------------------------------------------------------- #
# The prompt
# ---------------------------------------------------------------------- #


def test_the_live_prompt_is_not_the_json_prompt():
    """
    Two different jobs, and conflating them produces a machine reading out a
    data structure. `prompts.SYSTEM_INSTRUCTION` names slots and support types
    because it is constrained to a JSON schema; this one is spoken.
    """
    from app.prompts import SYSTEM_INSTRUCTION

    assert LIVE_SYSTEM_INSTRUCTION is not SYSTEM_INSTRUCTION
    assert "reporterName" not in LIVE_SYSTEM_INSTRUCTION
    assert "responseSchema" not in LIVE_SYSTEM_INSTRUCTION


def test_the_live_prompt_refuses_to_take_a_phone_number():
    """
    Spoken digits transcribe unreliably, and a wrong digit sends a rescue call
    to the wrong person. The review form already collects these exactly.
    """
    lowered = LIVE_SYSTEM_INSTRUCTION.lower()

    assert "phone number out loud" in lowered
    assert "digit by digit" in lowered

    for field in SPOKEN_UNRELIABLE_FIELDS:
        assert field not in LIVE_SYSTEM_INSTRUCTION


def test_the_live_prompt_asks_for_one_question_at_a_time():
    """Two short sentences, one question. Anything more is unusable in a
    conversation with someone who is frightened."""
    lowered = LIVE_SYSTEM_INSTRUCTION.lower()

    assert "one question per turn" in lowered
    assert "never read out lists" in lowered


def test_the_live_prompt_does_not_claim_to_decide_completeness():
    """
    Readiness is `slots.missing_slots()` and always was. A model that believes
    it is also deciding will start improvising about whether help is coming.
    """
    assert "complete" not in LIVE_SYSTEM_INSTRUCTION.lower()


def test_the_setup_pins_the_configured_model_and_voice():
    cfg = settings(gemini_live_model="gemini-3.8-live", gemini_live_voice="Charon")

    setup = live_connect_setup(cfg)

    assert setup["model"] == "models/gemini-3.8-live"
    voice = setup["generationConfig"]["speechConfig"]["voiceConfig"]
    assert voice["prebuiltVoiceConfig"]["voiceName"] == "Charon"


# ---------------------------------------------------------------------- #
# The reply language
# ---------------------------------------------------------------------- #


def test_the_live_prompt_pins_the_reply_language():
    """
    Nepali only, and pinned rather than described, because drift is invisible.

    A model that answers in English instead sounds *fine* on the wire: the audio
    arrives, the transcript arrives, `setupComplete` arrived, the status reads
    "Listening". Nothing the UI can see degrades. So the rule has to be
    asserted, and the three failure modes have to be named separately, because
    a prompt that only says "reply in Nepali" fails all three:

      * mirroring the reporter back into English (common — a reporter who
        switches mid-call, or an emergency number read in English),
      * reading English technical terms mid-sentence,
      * an unspecified register, which lands on formal Sanskritised prose or on
        casual slang and is harder to follow while frightened.
    """
    lowered = LIVE_SYSTEM_INSTRUCTION.lower()

    assert "only in nepali" in lowered
    assert "devanagari" in lowered
    assert "always" in lowered
    # The three rules above, named so the assertion fails if one is dropped.
    assert "you still reply in nepali" in lowered
    assert "do not mirror their language back" in lowered
    assert "never mix a sentence" in lowered
    assert "never read out english words" in lowered
    # Register, and the example that anchors it.
    assert "formality" in lowered
    assert "बाबा" in LIVE_SYSTEM_INSTRUCTION


def test_the_language_is_the_first_section():
    """
    Instruction order is how weight is actually assigned. The language rule
    buried in the middle of the prompt loses to whatever is above it, so it goes
    first and the tests assert that, not just that the words exist.
    """
    headings = [
        line for line in LIVE_SYSTEM_INSTRUCTION.splitlines() if line.startswith("# ")
    ]

    assert headings[0] == "# Language"


def test_the_setup_does_not_send_a_language_code():
    """
    A native-audio model picks its own output language and does not support an
    explicit `languageCode`; the audio-output language table has no Nepali entry
    either. So there is no `languageCode` to send, and the setting that used to
    feed one is gone from `Settings`.

    If this ever comes back, it will be because somebody wanted Nepali to be
    configurable. It is not: the system instruction is the only lever, and a
    second one that silently does nothing is worse than none.
    """
    setup = live_connect_setup(settings())

    assert "languageCode" not in setup["generationConfig"]["speechConfig"]
    assert "gemini_live_language" not in Settings.model_fields
