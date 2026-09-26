"""
Tests for the follow-up conversation on an existing ticket.

The two things worth pinning here are both stated as invariants in
`follow_up_service.py`, and both are invisible if they break:

  1. **The status is never model output.** The model is handed a status and
     asked what it means; it is never asked what the status is. If that ever
     regressed, a reporter could be told their ticket was dispatched while the
     row still said `submitted` — the worst output this service could produce.

  2. **The reporter's words land before the model is called, and appear in the
     prompt exactly once.** Persist-first means an outage cannot cost someone
     their question. Exactly-once matters just as much: the service reads the
     thread back *after* inserting, so without the exclusion the model is shown
     the same sentence twice on every single turn.

Both collaborators are faked, so no model calls and no quota.

    .venv/bin/python -m pytest app/tests -q
"""

from __future__ import annotations

import pytest

from app.config import Settings
from app.follow_up_prompts import _ticket_facts
from app.follow_up_service import FollowUpService
from app.gemini import GeminiError
from app.schemas import FollowUpRequest, SupportType, Ticket, TicketMessage, TicketStatus


# ------------------------------------------------------------------- fakes


class FakeGemini:
    """Records what it was asked and replies with whatever it was told to."""

    def __init__(self, payload=None, error: Exception | None = None) -> None:
        self.payload = payload or {}
        self.error = error
        self.calls: list[dict] = []

    async def generate_json(self, *, system_instruction, user_text, response_schema, **kw):
        self.calls.append(
            {
                "system_instruction": system_instruction,
                "user_text": user_text,
                "response_schema": response_schema,
            }
        )
        if self.error is not None:
            raise self.error
        return dict(self.payload), "gemini-test"


class FakeStore:
    """Enough of `TicketStore` for the follow-up path, in memory and ordered."""

    def __init__(self) -> None:
        self.rows: list[TicketMessage] = []
        self._next_id = 1
        self.write_order: list[str] = []

    async def add_message(self, ticket_id: str, role: str, text: str) -> TicketMessage:
        message = TicketMessage(
            id=self._next_id,
            ticket_id=ticket_id,
            role=role,  # type: ignore[arg-type]
            text=text.strip(),
            created_at="2026-09-26T06:00:00Z",
        )
        self._next_id += 1
        self.rows.append(message)
        self.write_order.append(text.strip())
        return message

    async def messages(self, ticket_id: str, *, limit: int = 200) -> list[TicketMessage]:
        return [m for m in self.rows if m.ticket_id == ticket_id][-limit:]


def ticket(**overrides) -> Ticket:
    base = {
        "id": "TKT-000426",
        "created_at": "2026-09-26T05:58:00Z",
        "updated_at": "2026-09-26T05:58:00Z",
        "status": TicketStatus.SUBMITTED,
        "reporter_name": "Amina Yusuf",
        "reporter_phone": "0722 555 019",
        "summary": "Trapped in my flat, the door is jammed.",
        "location": "Kileleshi Road, block C",
        "support_needed": [SupportType.RESCUE],
        "urgency": "critical",
        # A self-report: the victim fields are empty strings, not null. `null` is
        # reserved for the three columns that genuinely can be absent.
        "victim_name": "",
        "victim_phone": "",
        "people_affected": None,
        "on_behalf_of_other": False,
        "notes": "",
        "source": "chat",
        "session_id": None,
        "owner_email": "amina@example.org",
    }
    base.update(overrides)
    return Ticket.model_validate(base)


def service(gemini: FakeGemini, store: FakeStore) -> FollowUpService:
    return FollowUpService(Settings(gemini_api_key="test"), gemini, store)  # type: ignore[arg-type]


# ------------------------------------------------- invariant 1: status is ours


@pytest.mark.parametrize("status", list(TicketStatus))
async def test_status_is_echoed_from_the_row_never_from_the_model(status):
    """A model claiming a different status must not be able to move the ticket."""
    gemini = FakeGemini(
        payload={
            "reply": "Your report is with the response team.",
            "status": "resolved",  # the model is asked to lie
            "safetyNote": "",
            "confidence": 0.9,
        }
    )
    store = FakeStore()

    answer = await service(gemini, store).reply(
        ticket(status=status), FollowUpRequest(message="Is anyone coming?")
    )

    assert answer.status == status
    # And the status it echoed is the row's, even where they differ.
    assert answer.ticket.status == status


async def test_degraded_reply_also_echoes_the_row():
    gemini = FakeGemini(error=GeminiError("all models failed"))
    answer = await service(gemini, FakeStore()).reply(
        ticket(status=TicketStatus.SUBMITTED),
        FollowUpRequest(message="Has anyone read this?"),
    )

    assert answer.degraded is True
    assert answer.model == "offline"
    assert answer.status == TicketStatus.SUBMITTED


# --------------------------------------- invariant 2: stored first, said once


async def test_the_question_is_stored_before_the_model_is_called():
    """An outage must not cost the reporter their words."""
    store = FakeStore()
    gemini = FakeGemini(error=GeminiError("down"))

    # The model is faked to inspect the store at the moment it is called.
    class PeekingGemini(FakeGemini):
        async def generate_json(self, **kw):
            PeekingGemini.seen_at_call_time = list(store.rows)
            return await super().generate_json(**kw)

    PeekingGemini.seen_at_call_time = []
    await service(PeekingGemini(error=GeminiError("down")), store).reply(  # type: ignore[arg-type]
        ticket(), FollowUpRequest(message="My elderly neighbour has fallen.")
    )

    assert [m.text for m in PeekingGemini.seen_at_call_time] == [
        "My elderly neighbour has fallen."
    ]


async def test_the_question_appears_exactly_once_in_the_prompt():
    gemini = FakeGemini(payload={"reply": "Understood.", "safetyNote": "", "confidence": 0.8})
    await service(gemini, FakeStore()).reply(
        ticket(), FollowUpRequest(message="The water is still rising.")
    )

    prompt = gemini.calls[0]["user_text"]
    assert prompt.count("The water is still rising.") == 1


async def test_earlier_turns_are_still_replayed():
    store = FakeStore()
    gemini = FakeGemini(payload={"reply": "Noted.", "safetyNote": "", "confidence": 0.8})
    svc = service(gemini, store)

    await svc.reply(ticket(), FollowUpRequest(message="First question."))
    await svc.reply(ticket(), FollowUpRequest(message="Second question."))

    prompt = gemini.calls[1]["user_text"]
    assert "First question." in prompt
    assert "Noted." in prompt
    assert prompt.count("Second question.") == 1


# ------------------------------------------------------- degraded behaviour


async def test_a_failed_model_still_leaves_a_complete_turn_on_the_ticket():
    store = FakeStore()
    answer = await service(FakeGemini(error=GeminiError("down")), store).reply(
        ticket(), FollowUpRequest(message="Please hurry.")
    )

    assert [m.role for m in store.rows] == ["user", "assistant"]
    assert store.rows[1].text == answer.reply
    assert answer.degraded is True


async def test_an_empty_reply_is_treated_as_a_failure_not_a_silent_gap():
    """A valid envelope with nothing in it must not leave the thread with a hole."""
    store = FakeStore()
    gemini = FakeGemini(payload={"reply": "   ", "safetyNote": "", "confidence": 0.5})

    answer = await service(gemini, store).reply(
        ticket(), FollowUpRequest(message="Any news?")
    )

    assert answer.reply.strip()
    assert answer.degraded is True
    assert [m.role for m in store.rows] == ["user", "assistant"]


async def test_a_safety_note_survives_the_round_trip():
    """The model is required to emit one; dropping it would discard the only
    signal that outranks a helpful answer."""
    gemini = FakeGemini(
        payload={
            "reply": "I have added that to your ticket.",
            "safetyNote": "If anyone is unresponsive, call for an ambulance now.",
            "confidence": 0.7,
        }
    )
    answer = await service(gemini, FakeStore()).reply(
        ticket(), FollowUpRequest(message="My father is not waking up.")
    )

    assert answer.safety_note.startswith("If anyone is unresponsive")
    assert answer.degraded is False


async def test_a_degraded_turn_carries_no_safety_note():
    """The offline set makes no safety judgement, so it must not imply one."""
    answer = await service(FakeGemini(error=GeminiError("down")), FakeStore()).reply(
        ticket(), FollowUpRequest(message="Help.")
    )

    assert answer.safety_note == ""


async def test_the_ticket_is_handed_to_the_model_as_facts_not_as_a_question():
    gemini = FakeGemini(payload={"reply": "Yes.", "safetyNote": "", "confidence": 0.8})
    await service(gemini, FakeStore()).reply(
        ticket(status=TicketStatus.UNDER_REVIEW), FollowUpRequest(message="What now?")
    )

    prompt = gemini.calls[0]["user_text"]
    # What the model needs to answer.
    assert "TKT-000426" in prompt
    assert "Kileleshi Road" in prompt
    assert "Trapped in my flat" in prompt
    # The status is handed over as a fact, not asked for.
    assert "as a fact" in prompt


async def test_the_reporter_is_not_named_or_numbered_in_the_prompt():
    """
    The row has the reporter's name and phone; the prompt must not.

    This text is sent to a model. A reply that quoted someone's number back at
    them would be a privacy leak and buys the model nothing, so the exclusion is
    worth pinning — it is the kind of thing a well-meaning edit would undo.
    """
    gemini = FakeGemini(payload={"reply": "Yes.", "safetyNote": "", "confidence": 0.8})
    await service(gemini, FakeStore()).reply(
        ticket(), FollowUpRequest(message="Is this even being read?")
    )

    prompt = gemini.calls[0]["user_text"]
    assert "Amina Yusuf" not in prompt
    assert "0722 555 019" not in prompt
    # The victim's name, though, is fair game when there is one: without it the
    # model cannot tell who the ticket is actually about.
    assert "person_needing_help" in _ticket_facts(
        ticket(on_behalf_of_other=True, victim_name="Grace Yusuf")
    )
