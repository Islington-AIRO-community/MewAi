"""
The `ChatResponse` envelope, pinned.

Stage 4 of the voice feature replays a spoken transcript into this exact
response: the browser hands `useAiChat` a finished conversation, one
`POST /api/chat/message` produces the ticket draft, and `TicketReview` opens
because `missing` came back empty. So the shape of this response is the seam
between "someone spoke for four minutes" and "there is a ticket".

Nothing asserted it before. The field names below are load-bearing in two
places that cannot be type-checked against each other — `lib/ai-client.ts`
decodes this on the client, and a rename here would surface as a silently
`undefined` in the review form rather than an error. The `slots` dict is the
worst of them: it is keyed by camelCase `SlotName` values while the envelope
around it is snake_case, because the enum is shared with the TypeScript side.
That asymmetry is deliberate and easy to "tidy" by accident.

No database, no model calls.

    .venv/bin/python -m pytest app/tests -q
"""

from __future__ import annotations

import json

from app.schemas import (
    CaptureState,
    ChatResponse,
    SlotName,
    SupportType,
    TicketDraft,
    Urgency,
)

COMPLETE = ChatResponse(
    reply="I have everything I need. Please check the details before we send it.",
    draft=TicketDraft(
        reporter_name="Amina Yusuf",
        reporter_phone="07700900123",
        summary="Trapped on the first floor of Lincoln Primary with two children.",
        location="Lincoln Primary School, 12 Mill Road",
        people_affected="3",
        support_needed=[SupportType.RESCUE, SupportType.RELIEF_SUPPLIES],
        urgency=Urgency.CRITICAL,
    ),
    slots={
        SlotName.REPORTER_NAME: CaptureState.CAPTURED,
        SlotName.REPORTER_PHONE: CaptureState.CAPTURED,
        SlotName.SUMMARY: CaptureState.CAPTURED,
        SlotName.LOCATION: CaptureState.CAPTURED,
        SlotName.SUPPORT_NEEDED: CaptureState.CAPTURED,
        SlotName.URGENCY: CaptureState.CAPTURED,
        SlotName.PEOPLE_AFFECTED: CaptureState.CAPTURED,
        SlotName.VICTIM_NAME: CaptureState.NEEDED,
        SlotName.VICTIM_PHONE: CaptureState.NEEDED,
    },
    missing=[SlotName.VICTIM_NAME, SlotName.VICTIM_PHONE],
    next_questions=[SlotName.VICTIM_NAME, SlotName.VICTIM_PHONE],
    is_complete=False,
    safety_note="Keep clear of the north wall until crews say it is safe.",
    confidence=0.82,
    model="gemini-3.8-flash",
    degraded=False,
)


def test_the_envelope_uses_snake_case_keys():
    """
    The response envelope is snake_case. The `draft` object inside it is
    camelCase, because `TicketDraft`'s field names are shared with the
    TypeScript type. Both spellings are correct; only mixing them up is not.
    """
    body = COMPLETE.model_dump(mode="json")

    for key in (
        "next_questions",
        "is_complete",
        "safety_note",
        "degraded",
    ):
        assert key in body, f"{key} must stay snake_case on the wire"

    assert "nextQuestions" not in body
    assert "isComplete" not in body


def test_the_draft_object_is_snake_case_too():
    """
    The whole envelope is snake_case, `draft` included.

    This is worth pinning because it is a documented-sounding claim that is
    easy to get backwards: the camelCase in this wire format belongs to the
    *SlotName values* used as keys in `missing` and `slots`, not to the draft's
    own field names. `lib/ai-client.ts` reads `draft.reporter_name` and
    `draft.on_behalf_of_other`, so a "tidy" rename of the draft to camelCase
    would leave the review form reading `undefined` for every field — with no
    type error, because the client decodes untyped JSON.
    """
    draft = COMPLETE.model_dump(mode="json")["draft"]

    for key in (
        "reporter_name",
        "reporter_phone",
        "victim_name",
        "victim_phone",
        "support_needed",
        "people_affected",
        "on_behalf_of_other",
    ):
        assert key in draft, f"draft.{key} must stay snake_case"

    assert "reporterName" not in draft
    assert "onBehalfOfOther" not in draft


async def test_fastapi_really_emits_these_names():
    """
    The assertions above read the Pydantic model directly. This one goes
    through the actual response pipeline, because `by_alias` and friends could
    change what FastAPI puts on the wire without changing the model at all —
    which is exactly the kind of drift a unit test on the model would miss.
    """
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    app = FastAPI()

    @app.post("/probe", response_model=ChatResponse)
    async def _probe() -> ChatResponse:
        return COMPLETE

    body = TestClient(app).post("/probe").json()

    assert body["next_questions"] == ["victimName", "victimPhone"]
    assert body["draft"]["reporter_name"] == "Amina Yusuf"
    assert body["draft"]["on_behalf_of_other"] is False
    assert body["slots"]["reporterName"] == "captured"


def test_slot_keys_are_camel_case_slot_names():
    """
    `missing` and `slots` are keyed by `SlotName`, whose values are camelCase
    because they are the same identifiers the TypeScript UI iterates. The
    enum *names* are snake-free; only the values matter here.
    """
    body = COMPLETE.model_dump(mode="json")

    assert body["missing"] == ["victimName", "victimPhone"]
    assert body["next_questions"] == ["victimName", "victimPhone"]
    assert body["slots"]["reporterName"] == "captured"
    assert body["slots"]["victimName"] == "needed"


def test_the_envelope_survives_a_json_round_trip():
    """
    What the proxy actually does to it. If this needed a repair step, the
    browser would be the first place that showed.
    """
    raw = json.dumps(COMPLETE.model_dump(mode="json"))
    restored = ChatResponse.model_validate(json.loads(raw))

    assert restored.draft.reporter_name == "Amina Yusuf"
    assert restored.draft.urgency is Urgency.CRITICAL
    assert restored.missing == [SlotName.VICTIM_NAME, SlotName.VICTIM_PHONE]
    assert restored.is_complete is False
    assert restored.degraded is False


def test_an_empty_draft_is_representable():
    """
    The degraded path. A caller that renders the review form must be able to
    show "not captured" rather than a crash, and empty string is how this
    schema says "unknown" — so the empty case has to survive serialisation.
    """
    empty = ChatResponse(
        reply="Could you tell me your name?",
        draft=TicketDraft(),
        slots={s: CaptureState.UNKNOWN for s in SlotName},
        missing=list(SlotName),
        next_questions=[SlotName.REPORTER_NAME],
        is_complete=False,
        degraded=True,
    )

    body = empty.model_dump(mode="json")

    assert body["draft"]["reporter_name"] == ""
    assert body["draft"]["support_needed"] == []
    assert body["draft"]["urgency"] is None
    assert body["degraded"] is True
    # Unstated fields still have to be present with their defaults, or the
    # client sees `undefined` where it expects a string.
    assert body["safety_note"] == ""
    assert body["confidence"] == 0.0
    assert body["model"] == ""


def test_a_null_from_the_model_becomes_an_empty_string():
    """
    `TicketDraft` normalises nulls. A model that emits `null` for a gap it did
    not capture is normal, and must not become a 422 on the way back.
    """
    draft = TicketDraft.model_validate(
        {"reporter_name": None, "summary": None, "location": "Mill Road"}
    )

    assert draft.reporter_name == ""
    assert draft.summary == ""
    assert draft.location == "Mill Road"
