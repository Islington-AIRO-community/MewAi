"""
Tests for what the service says when Postgres is not there.

The service starts even when the database is unreachable, and that is
deliberate: intake has to survive a database blip, and a service that refuses to
boot takes the assistant down with it. What it must not do is fail *vaguely*.

The distinction these tests pin: 503 with a clear message, never 500 and never a
fake success. A 500 here reaches the browser as "something went wrong on our
side", which is indistinguishable from a bug in our own code. A 503 reaches it as
"the ticket database is unavailable, no ticket was saved" — retryable, honest,
and true.

The 502 case is the other half of the same contract and lives in the Next proxy
(`app/api/ai/_shared.ts`): *it* is unreachable, which is a different failure from
its database being down. Two codes for two different outages, on purpose.

No database and no model calls.

    .venv/bin/python -m pytest app/tests -q
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.routers import tickets as tickets_router
from app.schemas import SupportType, Ticket, TicketStatus


class DownStore:
    """A store that never connected — the `ready = False` state at startup."""

    ready = False


class FakeRequest:
    def __init__(self, store) -> None:
        self.headers = {}
        self.app = type("App", (), {"state": type("S", (), {"tickets": store})()})()


async def test_the_database_gate_fires_before_any_ticket_lookup():
    """Ordering matters: an unavailable database must not be reported as 404,
    which would tell a reporter their request does not exist."""
    with pytest.raises(HTTPException) as caught:
        await tickets_router.get_ticket("TKT-000426", FakeRequest(DownStore()))

    assert caught.value.status_code == 503
    assert "no ticket was saved" in caught.value.detail.lower()


async def test_filing_reports_unavailable_rather_than_succeeding():
    with pytest.raises(HTTPException) as caught:
        await tickets_router.create_ticket(
            tickets_router.TicketCreate(
                reporter_name="Amina Yusuf",
                reporter_phone="0722 555 019",
                summary="Trapped in my flat, the door is jammed.",
                location="Kileleshi Road",
                support_needed=[SupportType.RESCUE],
                urgency="critical",
            ),
            FakeRequest(DownStore()),
        )

    assert caught.value.status_code == 503
    # And it must not be a 500: that is what tells the client "our bug".
    assert caught.value.status_code != 500


async def test_a_follow_up_cannot_be_answered_without_a_database():
    """A follow-up writes the reporter's turn first, so with no database there is
    nothing to append to and the turn must fail loudly rather than vanish."""
    with pytest.raises(HTTPException) as caught:
        await tickets_router.get_conversation("TKT-000426", FakeRequest(DownStore()))

    assert caught.value.status_code == 503


async def test_an_unavailable_database_is_not_the_same_as_an_empty_queue():
    """`list_tickets` returning `total: 0` on a broken database would show an
    admin "the queue is clear" — the most dangerous possible lie on this screen."""
    with pytest.raises(HTTPException) as caught:
        await tickets_router.list_tickets(FakeRequest(DownStore()))

    assert caught.value.status_code == 503


async def test_my_tickets_reports_unavailable_rather_than_no_account():
    """`/mine` used to check the header before the database, so an outage came
    back as 400 "No account on this request" — which reads to a signed-in
    reporter as though their session had gone, rather than as a retryable
    outage."""
    with pytest.raises(HTTPException) as caught:
        await tickets_router.list_my_tickets(FakeRequest(DownStore()))

    assert caught.value.status_code == 503


async def test_claiming_reports_unavailable_rather_than_refusing():
    """
    The worst of the seven, and the reason the ordering is pinned.

    Anonymous intake is a supported path, so `/claim` is how someone gets their
    ticket back. Answering 404 here — which is what the header check used to do
    when the database was down — tells a reporter who has just typed in their
    reference and phone number that the ticket they filed does not exist, during
    a database blip, with no other way to find out what is happening.
    """
    with pytest.raises(HTTPException) as caught:
        await tickets_router.claim_ticket(
            tickets_router.TicketClaim(
                ticket_id="TKT-000001", reporter_phone="0722 555 019"
            ),
            FakeRequest(DownStore()),
        )

    assert caught.value.status_code == 503
    # Still not a refusal: the fixed claim string must not appear, or a caller
    # would read it as "no such ticket" rather than "try again".
    assert "do not match a ticket" not in str(caught.value.detail).lower()
