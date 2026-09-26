"""
Tests for who is allowed to read a ticket.

Every one of these assertions is a privacy boundary. A ticket holds a reporter's
name, phone number, address and sometimes someone else's, filed during an
emergency, and the ids are sequential (`TKT-000001`, `TKT-000002`, ...) — so an
endpoint that answers "not yours" differently from "no such ticket" is an
enumeration oracle over the whole table.

The rule under test, stated once in `app/routers/tickets.py`:

  - A ticket is readable by the account that filed it, and by nobody else.
  - A ticket filed signed out belongs to nobody, therefore to no caller — until
    the reporter claims it with the phone number they gave, which is the only
    way it ever gains an owner after the fact.
  - A wrong owner and a missing ticket are indistinguishable: both 404. The same
    holds for a wrong phone and a wrong reference, which must also be worded
    identically.

No database and no model calls; the store is faked.

    .venv/bin/python -m pytest app/tests -q
"""

from __future__ import annotations

import pytest

from app.routers import tickets as tickets_router
from app.schemas import SupportType, Ticket, TicketStatus


OWNER = "amina@example.org"
STRANGER = "someone-else@example.org"
TICKET_ID = "TKT-000426"


def make_ticket(**overrides) -> Ticket:
    base = {
        "id": TICKET_ID,
        "created_at": "2026-09-26T05:58:00Z",
        "updated_at": "2026-09-26T05:58:00Z",
        "status": TicketStatus.SUBMITTED,
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
        "source": "chat",
        "session_id": None,
        "owner_email": OWNER,
    }
    base.update(overrides)
    return Ticket.model_validate(base)


class FakeStore:
    """Stands in for `TicketStore`. `ready` gates the endpoints' 503, and it is
    True here because these tests are about ownership, not availability."""

    ready = True

    def __init__(self, ticket: Ticket | None) -> None:
        self._ticket = ticket

    async def get(self, ticket_id: str) -> Ticket | None:
        return self._ticket if self._ticket and self._ticket.id == ticket_id else None

    async def messages(self, ticket_id: str, *, limit: int = 200) -> list:
        return []

    async def claim(
        self, ticket_id: str, owner_email: str, reporter_phone: str
    ) -> Ticket | None:
        """
        Models the guarded UPDATE in `TicketStore.claim` rather than what the
        router *hopes* for: every condition that would make the real statement
        match zero rows returns None here, and mutating `self._ticket` is what
        makes a second claim of the same row fail.
        """
        ticket = self._ticket
        if ticket is None or ticket.id != ticket_id:
            return None
        if ticket.owner_email is not None:  # `owner_email IS NULL` in the WHERE
            return None
        if ticket.reporter_phone != reporter_phone:  # `reporter_phone = $3`
            return None
        self._ticket = ticket.model_copy(update={"owner_email": owner_email})
        return self._ticket


class FakeRequest:
    def __init__(self, owner: str | None, store: FakeStore) -> None:
        self._headers = {}
        if owner is not None:
            self._headers[tickets_router._OWNER_HEADER] = owner
        self.app = type(
            "App", (), {"state": type("S", (), {"tickets": store})()}
        )()

    @property
    def headers(self):
        return self._headers


@pytest.fixture(autouse=True)
def _no_follow_up_service(monkeypatch):
    """The follow-up path needs a Gemini client; the ownership tests never get
    that far, but `post_message` resolves it before checking ownership."""
    monkeypatch.setattr(
        tickets_router, "_follow_up", lambda request: pytest.fail("unexpected model call")
    )


def request_for(owner: str | None, ticket: Ticket | None) -> FakeRequest:
    return FakeRequest(owner, FakeStore(ticket))


# --------------------------------------------------------------------- _owns


def test_the_filer_owns_their_ticket():
    assert tickets_router._owns(make_ticket(), OWNER) is True


def test_someone_else_does_not():
    assert tickets_router._owns(make_ticket(), STRANGER) is False


def test_an_unowned_ticket_belongs_to_nobody():
    """The signed-out intake path: a real ticket with no portal, by design."""
    assert tickets_router._owns(make_ticket(owner_email=None), OWNER) is False


def test_a_caller_with_no_header_owns_nothing():
    assert tickets_router._owns(make_ticket(), None) is False


def test_ownership_is_case_insensitive_on_both_sides():
    """The proxy lowercases, and so does `_clean_email`; a mixed-case header
    must not become a lockout for someone who typed their address correctly."""
    assert tickets_router._owns(make_ticket(owner_email="Amina@Example.org"), OWNER) is True
    assert tickets_router._owns(make_ticket(), "Amina@Example.org") is True


def test_an_empty_header_is_treated_as_absent():
    assert tickets_router._request_owner(FakeRequest("   ", FakeStore(None))) is None
    assert tickets_router._request_owner(FakeRequest("", FakeStore(None))) is None


# ------------------------------------------------------- endpoint behaviour


async def test_get_ticket_returns_the_ticket_to_its_owner():
    ticket = await tickets_router.get_ticket(TICKET_ID, request_for(OWNER, make_ticket()))
    assert ticket.id == TICKET_ID


@pytest.mark.parametrize("caller", [STRANGER, None])
async def test_get_ticket_404s_for_anyone_else(caller):
    """Not 403. A 403 would confirm the id exists."""
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as caught:
        await tickets_router.get_ticket(TICKET_ID, request_for(caller, make_ticket()))
    assert caught.value.status_code == 404


async def test_get_ticket_404s_for_a_signed_out_ticket_even_for_its_own_history():
    """Nobody can reopen it, not even the person who filed it — without an
    account there is no way to prove that is you."""
    from fastapi import HTTPException

    anonymous = make_ticket(owner_email=None)
    with pytest.raises(HTTPException) as caught:
        await tickets_router.get_ticket(TICKET_ID, request_for(OWNER, anonymous))
    assert caught.value.status_code == 404


async def test_a_missing_ticket_is_indistinguishable_from_a_wrong_owner():
    """The whole point: probing ids must not tell you which ones exist."""
    from fastapi import HTTPException

    async def status_for(ticket, caller):
        with pytest.raises(HTTPException) as caught:
            await tickets_router.get_ticket(TICKET_ID, request_for(caller, ticket))
        return caught.value.status_code, caught.value.detail

    wrong_owner = await status_for(make_ticket(), STRANGER)
    no_such_row = await status_for(None, OWNER)
    assert wrong_owner == no_such_row


async def test_the_conversation_endpoint_applies_the_same_rule():
    from fastapi import HTTPException

    await tickets_router.get_conversation(TICKET_ID, request_for(OWNER, make_ticket()))

    with pytest.raises(HTTPException) as caught:
        await tickets_router.get_conversation(
            TICKET_ID, request_for(STRANGER, make_ticket())
        )
    assert caught.value.status_code == 404


# --------------------------------------------------------------- who owns it


class RecordingStore(FakeStore):
    ready = True

    def __init__(self) -> None:
        super().__init__(None)
        self.inserted = None

    async def insert(self, payload):
        self.inserted = payload
        return make_ticket(owner_email=payload.owner_email)


async def creation(owner_header: str | None, body_owner: str | None = None) -> str | None:
    """File a ticket and report the owner actually written to the row."""
    store = RecordingStore()
    request = FakeRequest(owner_header, store)

    await tickets_router.create_ticket(
        tickets_router.TicketCreate(
            reporter_name="Amina Yusuf",
            reporter_phone="0722 555 019",
            summary="Trapped in my flat, the door is jammed.",
            location="Kileleshi Road",
            support_needed=[SupportType.RESCUE],
            urgency="critical",
            owner_email=body_owner,
        ),
        request,
    )
    return store.inserted.owner_email


async def test_the_header_decides_the_owner_not_the_body():
    """
    The regression this pins: ownership used to be read from the request body.

    That made the one field deciding who can read a ticket forgeable by any caller
    that reached this service directly — file a ticket as a victim, then read
    their whole queue through `/api/tickets/mine`.
    """
    assert await creation(OWNER, body_owner=STRANGER) == OWNER
    assert await creation(OWNER, body_owner=None) == OWNER


async def test_a_direct_caller_with_no_header_cannot_claim_an_owner():
    assert await creation(None, body_owner=STRANGER) is None
    assert await creation(None, body_owner=None) is None


async def test_signed_out_intake_still_produces_a_real_ticket():
    """Owner is optional by design — intake must never demand a Google account
    from someone who needs help right now. A null owner means no portal, not a
    rejected request."""
    assert await creation(None) is None


# ------------------------------------------------------- claiming an orphan


def orphan() -> Ticket:
    """A ticket filed while signed out: real, durable, and attached to nobody."""
    # `reporter_phone` is stored the way `normalise_phone` leaves it, i.e. with
    # the spaces already gone. The store normalises on insert, so a mixed value
    # here would be a fixture that cannot occur.
    return make_ticket(owner_email=None, reporter_phone="0722555019")


def claim_request(owner: str | None, ticket: Ticket | None) -> FakeRequest:
    return FakeRequest(owner, FakeStore(ticket))


def payload(**overrides):
    base = {"ticket_id": TICKET_ID, "reporter_phone": "0722555019"}
    base.update(overrides)
    return tickets_router.TicketClaim(**base)


async def refuse(body, request) -> str:
    """
    Assert a claim fails, and hand back the 404's text.

    The text matters as much as the code: every rejection has to be worded
    identically, or the endpoint becomes a probe for which references exist.
    """
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as caught:
        await tickets_router.claim_ticket(body, request)
    assert caught.value.status_code == 404
    return str(caught.value.detail)


async def test_an_orphan_can_be_claimed_with_its_own_phone():
    claimed = await tickets_router.claim_ticket(
        payload(), claim_request(OWNER, orphan())
    )
    assert claimed is not None
    assert claimed.owner_email == OWNER


async def test_a_reporter_can_retype_their_phone_however_they_like():
    """
    The trap that would lock people out of their own ticket.

    `normalise_phone` runs on the way *in* to insert, so the row holds
    `0722555019` no matter how the reporter typed it. If the claim compared raw
    strings, someone who retypes `0722 555 019` — the form they originally filled
    in — would be told their ticket does not exist, during a disaster, with no
    other way to find out what is happening to them.
    """
    claimed = await tickets_router.claim_ticket(
        payload(reporter_phone="0722 555 019"), claim_request(OWNER, orphan())
    )
    assert claimed is not None
    assert claimed.owner_email == OWNER


async def test_a_wrong_phone_cannot_claim():
    await refuse(payload(reporter_phone="07700900123"), claim_request(OWNER, orphan()))


async def test_a_wrong_reference_cannot_claim():
    await refuse(payload(ticket_id="TKT-999999"), claim_request(OWNER, orphan()))


async def test_a_wrong_phone_and_a_wrong_reference_are_indistinguishable():
    """
    Both answer 404 with the same text. If a wrong phone read differently from a
    wrong reference, this endpoint would confirm which references exist — and the
    ids are sequential, so that is the whole table.
    """
    wrong_phone = await refuse(
        payload(reporter_phone="07700900123"), claim_request(OWNER, orphan())
    )
    wrong_reference = await refuse(
        payload(ticket_id="TKT-999999"), claim_request(OWNER, orphan())
    )
    assert wrong_phone == wrong_reference


async def test_an_owned_ticket_cannot_be_taken_over():
    """
    The reason the guard lives in the SQL `WHERE` rather than in Python.

    Without `owner_email IS NULL` on the UPDATE, this endpoint would be a
    universal account-takeover: sign in with any address, name a victim, produce
    their phone number, and take the ticket off their account.
    """
    await refuse(payload(), claim_request(STRANGER, make_ticket(owner_email=OWNER)))


async def test_a_ticket_cannot_be_claimed_twice():
    """
    The race the single statement prevents. Two callers reaching the same orphan
    would both read `owner_email IS NULL` in a read-then-write, and the second
    write would win. Here the first claim sets the owner, so the second matches
    zero rows.
    """
    store = FakeStore(orphan())
    request = FakeRequest(OWNER, store)

    first = await tickets_router.claim_ticket(payload(), request)
    assert first is not None and first.owner_email == OWNER

    await refuse(payload(), request)
    assert store._ticket is not None
    assert store._ticket.owner_email == OWNER, "the first claimer keeps it"


async def test_a_signed_out_caller_cannot_claim():
    """There is no account to attach the ticket to, so there is nothing to do."""
    await refuse(payload(), claim_request(None, orphan()))


async def test_claiming_against_a_ticket_that_is_not_there_fails():
    await refuse(payload(), claim_request(OWNER, None))
