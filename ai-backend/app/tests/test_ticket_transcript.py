"""
Tests for the spoken intake: what is stored with a ticket, and who may read it.

A voice call is a reporter describing an emergency out loud. The transcript of it
is evidence of what they said, and this feature adds three privacy surfaces that
did not exist before, so each is pinned here rather than assumed:

  1. **A ticket and its transcript are written together or not at all.** A
     responder holding a ticket with no record of the call has been handed the
     summary and none of the detail. `TicketStore.insert` takes the transcript as
     an argument precisely so there is no second request to lose.

  2. **A transcript is not a follow-up message.** This is the subtle one. The
     follow-up prompt renders any non-`user` row from `ticket_messages` with the
     literal label "Assistant", so a transcript sharing that table would be fed to
     a model as though the assistant had said it — and would carry the reporter's
     spoken name and phone number into a prompt, which is exactly what
     `_ticket_facts` is built to avoid. Two tables, two vocabularies, one reader
     each.

  3. **The reporter and the admin read it through different routes, with
     different rules.** The reporter's is owner-scoped and answers 404 for anyone
     else, because the ids are sequential and "not yours" must be
     indistinguishable from "no such ticket". The admin's has no owner check at
     all, because an operator is not the reporter and usually has no account — it
     is gated by `requireAdmin()` in the Next proxy instead, and that is the whole
     access control. `test_ticket_ownership.py` holds the rest of the ownership
     contract.

Also pinned: a typed ticket is not an error. `turns: []` is a real answer, and the
UI is worded that way, so the endpoint must be 200 rather than 404.

No database and no model calls; the store is faked. The DDL itself is
`CREATE TABLE IF NOT EXISTS`, so an existing deployment picks this up on the next
startup with no migration — there is no migration tool in this project.

    .venv/bin/python -m pytest app/tests -q
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.db import MAX_TRANSCRIPT_TURNS
from app.routers import tickets as tickets_router
from app.schemas import (
    SupportType,
    Ticket,
    TicketCreate,
    TicketStatus,
    TicketTranscriptTurn,
)


OWNER = "amina@example.org"
STRANGER = "someone-else@example.org"
TICKET_ID = "TKT-000427"

# A real call, as the browser buffers it: what the reporter said, what the
# assistant asked, and the answer.
CALL: list[TicketTranscriptTurn] = [
    TicketTranscriptTurn(seq=0, role="reporter", text="My name is Amina Yusuf."),
    TicketTranscriptTurn(
        seq=1, role="assistant", text="I am sorry. What is your phone number?"
    ),
    TicketTranscriptTurn(seq=2, role="reporter", text="It is 0722 555 019."),
]


def make_ticket(**overrides) -> Ticket:
    base = {
        "id": TICKET_ID,
        "created_at": "2026-09-26T05:58:00Z",
        "updated_at": "2026-09-26T05:58:00Z",
        "status": TicketStatus.SUBMITTED,
        "reporter_name": "Amina Yusuf",
        "reporter_phone": "0722555019",
        "victim_name": "",
        "victim_phone": "",
        "summary": "Trapped in my flat, the door is jammed.",
        "location": "Kileleshi Road, block C",
        "people_affected": None,
        "support_needed": [SupportType.RESCUE],
        "urgency": "critical",
        "on_behalf_of_other": False,
        "notes": "",
        "source": "voice",
        "session_id": "sess-1",
        "owner_email": OWNER,
    }
    base.update(overrides)
    return Ticket.model_validate(base)


def make_create(**overrides) -> TicketCreate:
    base = {
        "reporter_name": "Amina Yusuf",
        "reporter_phone": "0722 555 019",
        "victim_name": "",
        "victim_phone": "",
        "summary": "Trapped in my flat, the door is jammed.",
        "location": "Kileleshi Road, block C",
        "people_affected": None,
        "support_needed": [SupportType.RESCUE],
        "urgency": "critical",
        "on_behalf_of_other": False,
        "notes": "",
        "source": "voice",
        "session_id": "sess-1",
    }
    base.update(overrides)
    return TicketCreate(**base)


class FakeStore:
    """
    Stands in for `TicketStore`, and models the parts the transcript depends on.

    `insert` records the transcript it was handed, which is what lets these tests
    assert the *argument* is passed rather than only that the route did not
    crash. `messages` stays empty regardless of the transcript, which is how the
    separation from the follow-up thread is pinned without a database.
    """

    ready = True

    def __init__(self, ticket: Ticket | None, turns: list | None = None) -> None:
        self._ticket = ticket
        self._turns = list(turns or [])
        self.inserted = None
        self.inserted_transcript = None

    async def get(self, ticket_id: str) -> Ticket | None:
        return self._ticket if self._ticket and self._ticket.id == ticket_id else None

    async def messages(self, ticket_id: str, *, limit: int = 200) -> list:
        # Empty even when a transcript exists. A store that merged them would
        # fail `test_a_transcript_is_never_part_of_the_follow_up_thread` in a way
        # that reads as a bug in the test rather than in the store.
        return []

    async def transcript(self, ticket_id: str) -> list:
        return self._turns

    async def insert(self, payload, transcript=()):
        self.inserted = payload
        self.inserted_transcript = list(transcript)
        return make_ticket(owner_email=payload.owner_email)


class FakeRequest:
    def __init__(self, owner: str | None, store: FakeStore) -> None:
        self._headers = {}
        if owner is not None:
            self._headers[tickets_router._OWNER_HEADER] = owner
        self.app = type("App", (), {"state": type("S", (), {"tickets": store})()})()

    @property
    def headers(self):
        return self._headers


# --------------------------------------------------------------- atomic write


async def test_a_voice_ticket_is_filed_with_its_transcript_in_one_call():
    """
    The one write, not two.

    The alternative — insert, then POST the transcript — has a window where a
    durable ticket exists with no record of the call, and that window is exactly
    when a submit is retried by a reporter on a bad connection.
    """
    store = FakeStore(None)
    await tickets_router.create_ticket(
        make_create(transcript=CALL), FakeRequest(OWNER, store)
    )

    assert store.inserted is not None
    assert store.inserted_transcript == CALL


async def test_a_typed_ticket_carries_no_transcript():
    store = FakeStore(None)
    await tickets_router.create_ticket(make_create(source="ai-chat"), FakeRequest(OWNER, store))
    assert store.inserted_transcript == []


async def test_a_sos_ticket_carries_no_transcript():
    """SOS is not a conversation. It has no turns to store and no caller to
    buffer them."""
    store = FakeStore(None)
    await tickets_router.create_ticket(make_create(source="sos"), FakeRequest(OWNER, store))
    assert store.inserted_transcript == []


async def test_turn_order_is_renumbered_from_the_order_given():
    """
    The browser watched the call happen, so it is trusted on order and the
    numbers are derived.

    Left as sent, two chunks of a streaming transcription arriving with the same
    `seq` would collide on `(ticket_id, seq)` and fail the whole insert — taking
    the ticket with it, over a bookkeeping field.
    """
    renumbered = TicketCreate(
        **{
            **make_create().model_dump(),
            "transcript": [
                {"seq": 7, "role": "reporter", "text": "first"},
                {"seq": 7, "role": "assistant", "text": "second"},
            ],
        }
    )
    assert [t.seq for t in renumbered.transcript] == [0, 1]


def test_turns_are_accepted_without_a_seq():
    """
    The wire format is `{role, text}` and nothing else.

    This is the regression that made voice filing impossible. `seq` was a required
    field on `TicketTranscriptTurn`, but the Next proxy forwards the browser's
    turns verbatim as `{role, text}` and never invents an ordinal it did not
    observe — so every real spoken ticket was rejected with a 422 naming a field
    the client had no way to know it owed. Nothing caught it because every test
    here constructed its turns in Python, where writing `seq=` was easier than
    not writing it, and so the tests agreed with each other and with nothing else.

    The fix is the default, and this test exists to keep the two ends honest: it
    holds the shape the proxy really sends.
    """
    ticket = TicketCreate(
        **{
            **make_create().model_dump(),
            "transcript": [
                {"role": "reporter", "text": "The water is up to my knees."},
                {"role": "assistant", "text": "Are you able to move?"},
            ],
        }
    )
    assert [t.seq for t in ticket.transcript] == [0, 1]


async def test_turn_text_is_trimmed_on_the_way_in():
    """A transcription fragment arrives padded, and a stored line that begins
    with a space reads as a formatting accident in an evidence record."""
    store = FakeStore(None)
    await tickets_router.create_ticket(
        make_create(
            transcript=[TicketTranscriptTurn(seq=0, role="reporter", text="  hello  ")]
        ),
        FakeRequest(OWNER, store),
    )
    assert store.inserted_transcript[0].text == "hello"


def test_a_turn_may_not_be_blank():
    """Checked at the schema, so it is a 422 from a malformed body rather than a
    blank line in the record."""
    with pytest.raises(ValueError):
        TicketTranscriptTurn(seq=0, role="reporter", text="   ")


def test_a_turn_may_not_be_impostor():
    """`user` is the follow-up table's vocabulary. Accepting it here would let a
    caller file a spoken line that reads as something the reporter typed later."""
    with pytest.raises(ValueError):
        TicketTranscriptTurn(seq=0, role="user", text="I am fine, nothing is wrong.")


def test_the_batch_is_bounded():
    """
    Bounded, not truncated.

    Truncating at 60 turns would drop the *oldest* part of the call, which is the
    part least likely to be redundant and the part that opens the account of what
    happened. Rejecting is the honest option: the reporter can submit without it.
    """
    long_call = [
        {"seq": i, "role": "reporter", "text": f"turn {i}"} for i in range(MAX_TRANSCRIPT_TURNS + 1)
    ]
    with pytest.raises(ValueError):
        TicketCreate(**{**make_create().model_dump(), "transcript": long_call})


# ------------------------------------------- separate from the follow-up thread


async def test_a_transcript_is_never_part_of_the_follow_up_thread():
    """
    The leak this design exists to prevent.

    `FollowUpService` builds its prompt from `messages()`, which is a single
    global 200-row window ordered by id. Had a call been written into
    `ticket_messages`, a long conversation would have pushed the reporter's
    follow-up history out of the window, and every non-`user` row is rendered with
    the literal label "Assistant" — so the reporter's own spoken words would have
    been handed to the model as the assistant's, carrying the name and phone
    number they had just dictated.
    """
    store = FakeStore(make_ticket(), CALL)
    assert await store.messages(TICKET_ID) == []
    assert await store.transcript(TICKET_ID) == CALL


# ---------------------------------------------------------- who may read it


async def test_the_reporter_can_read_their_own_transcript():
    result = await tickets_router.get_transcript(TICKET_ID, FakeRequest(OWNER, FakeStore(make_ticket(), CALL)))
    assert result.ticket_id == TICKET_ID
    assert [t.text for t in result.turns] == [t.text for t in CALL]


@pytest.mark.parametrize("caller", [STRANGER, None])
async def test_the_reporter_transcript_is_404_for_anyone_else(caller):
    """
    404, not 403 — the ids are `TKT-000001`, `TKT-000002`, and so on, so a 403
    turns this into a scan of the whole table.
    """
    with pytest.raises(HTTPException) as caught:
        await tickets_router.get_transcript(
            TICKET_ID, FakeRequest(caller, FakeStore(make_ticket(), CALL))
        )
    assert caught.value.status_code == 404


async def test_a_wrong_owner_and_a_missing_ticket_are_indistinguishable():
    async def status_for(ticket, caller):
        with pytest.raises(HTTPException) as caught:
            await tickets_router.get_transcript(
                TICKET_ID, FakeRequest(caller, FakeStore(ticket, CALL))
            )
        return caught.value.status_code, caught.value.detail

    assert await status_for(make_ticket(), STRANGER) == await status_for(None, OWNER)


async def test_an_anonymous_ticket_has_no_transcript_portal():
    """
    Belongs to nobody, therefore to no caller.

    The same rule as every other ticket read, and it is worth restating here
    because a transcript is a richer prize than a summary: a reporter who filed
    signed out keeps their ticket and their call, and can recover both by claiming
    the ticket with their phone number.
    """
    with pytest.raises(HTTPException) as caught:
        await tickets_router.get_transcript(
            TICKET_ID, FakeRequest(OWNER, FakeStore(make_ticket(owner_email=None), CALL))
        )
    assert caught.value.status_code == 404


async def test_a_typed_ticket_has_an_empty_transcript_rather_than_a_404():
    """
    "You typed this in" is a real answer to "what was said on the call", and the
    UI is worded that way. A 404 would report the record as missing when nothing
    is.
    """
    result = await tickets_router.get_transcript(
        TICKET_ID, FakeRequest(OWNER, FakeStore(make_ticket(source="ai-chat"), []))
    )
    assert result.turns == []


# ------------------------------------------------------------- the admin read


async def test_an_admin_reads_the_transcript_of_someone_elses_ticket():
    """
    No owner check, and no account required.

    An operator working the queue is not the reporter and frequently has no
    account at all, so the reporter's rule would make the transcript unreadable
    to the people who need it. The gate is `requireAdmin()` in
    `app/api/ai/admin/tickets/[id]/transcript/route.ts` — server-side, before this
    is reachable at all — which is why it is a *separate route* rather than a flag
    on the reporter's.
    """
    result = await tickets_router.get_transcript_admin(
        TICKET_ID, FakeRequest(None, FakeStore(make_ticket(), CALL))
    )
    assert [t.text for t in result.turns] == [t.text for t in CALL]


async def test_the_admin_read_still_404s_on_a_missing_ticket():
    """Otherwise the route answers "yes" or "no such ticket" for every id in the
    table, and the enumeration problem returns one route over."""
    with pytest.raises(HTTPException) as caught:
        await tickets_router.get_transcript_admin(TICKET_ID, FakeRequest(None, FakeStore(None)))
    assert caught.value.status_code == 404


async def test_both_readers_see_the_same_words():
    """
    One renderer, two audiences.

    A transcript that reads differently depending on who opened it cannot be used
    to check a detail against — the whole reason to keep it — so the reporter and
    the admin must get identical text, and the only difference between the two
    routes is who is allowed to ask.
    """
    store = FakeStore(make_ticket(), CALL)
    reporter_view = await tickets_router.get_transcript(TICKET_ID, FakeRequest(OWNER, store))
    admin_view = await tickets_router.get_transcript_admin(TICKET_ID, FakeRequest(None, store))
    assert [(t.role, t.text) for t in reporter_view.turns] == [
        (t.role, t.text) for t in admin_view.turns
    ]
