"""
`/api/tickets` — create, read and list relief tickets.

`POST` is the endpoint the chat's review form calls. It re-validates against the
required-attribute rules before writing, so a client that skips the review form
(or an attacker replaying a hand-rolled request) still cannot create a ticket
without a reporter name, a dialable number, a summary, a location and at least
one support class.

`GET /`, `GET /stats` and `PATCH /{id}/status` exist for the admin work that
comes next. They are read/write primitives with no UI attached yet.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel

from ..db import TicketStore
from ..follow_up_service import FollowUpService
from ..schemas import (
    FollowUpRequest,
    FollowUpResponse,
    Ticket,
    TicketClaim,
    TicketCreate,
    TicketDraft,
    TicketListResponse,
    TicketConversation,
    TicketStatus,
)
from ..slots import missing_slots, normalise_phone

log = logging.getLogger(__name__)

router = APIRouter(prefix="/tickets", tags=["tickets"])


class StatusUpdate(BaseModel):
    status: TicketStatus


# One message for every way a claim can fail, with nothing echoed back.
#
# An earlier version of this endpoint said `No ticket with id {ticket_id}.`, on
# the reasoning that the id was the caller's own input so echoing it revealed
# nothing. That is true of the echo but wrong about the consequence: a wrong
# *phone* on a real reference and a wrong *reference* then produce different
# sentences, which is enough to tell a caller that a given reference exists.
# A constant makes indistinguishability true by construction instead of by
# argument, and there is nothing here for a caller to do with a more specific
# message anyway.
_CLAIM_REFUSED = "That reference and phone number do not match a ticket."


class TicketStats(BaseModel):
    total: int
    by_status: dict[str, int]
    by_urgency: dict[str, int]
    by_support: dict[str, int]


def _store(request: Request) -> TicketStore:
    store: TicketStore = request.app.state.tickets
    if not store.ready:
        # The service starts even when Postgres is unreachable, so this is a
        # normal reachable state rather than a bug — but it must be reported as
        # "try again", not as a crash. Left unguarded it surfaced as an
        # unhandled `RuntimeError` from `_require_pool` and FastAPI answered
        # 500, which the browser reads as "the ticket could not be created" and
        # cannot tell apart from a rejected payload.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The ticket database is unavailable. No ticket was saved.",
        )
    return store


def _follow_up(request: Request) -> FollowUpService:
    return request.app.state.follow_up


def _as_draft(payload: TicketCreate) -> TicketDraft:
    """Project a validated create request onto the same shape the chat uses."""
    return TicketDraft(
        reporter_name=payload.reporter_name,
        reporter_phone=payload.reporter_phone,
        victim_name=payload.victim_name,
        victim_phone=payload.victim_phone,
        summary=payload.summary,
        location=payload.location,
        people_affected=(
            "" if payload.people_affected is None else str(payload.people_affected)
        ),
        support_needed=payload.support_needed,
        urgency=payload.urgency,
        on_behalf_of_other=payload.on_behalf_of_other,
        notes=payload.notes,
    )


@router.post(
    "",
    response_model=Ticket,
    status_code=status.HTTP_201_CREATED,
    summary="Create a relief ticket",
)
async def create_ticket(payload: TicketCreate, request: Request) -> Ticket:
    store = _store(request)

    # Same predicate the chat used to decide whether to open the review form, so
    # "the form was shown" and "the write is allowed" cannot disagree.
    missing = [slot.value for slot in missing_slots(_as_draft(payload))]
    errors = payload.validation_errors()
    if errors:
        missing.extend(m for m in ("victimName", "victimPhone") if m not in missing)
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "A relief ticket requires every essential attribute.",
                "missing": sorted(set(missing)),
            },
        )

    # The owner comes from the header, never from the body.
    #
    # `TicketCreate.owner_email` exists so the *proxy* can pass the session
    # address through, but a request body is client-supplied and this service may
    # be reached directly. If the row's owner were read from the payload, anyone
    # could file a ticket claiming to be someone else and then read that account's
    # queue through `/api/tickets/mine` — so ownership, the one field that decides
    # who can see this data, is resolved here and nowhere else.
    owner = _request_owner(request)
    claimed = (payload.owner_email or "").strip().lower() or None
    if claimed and owner and claimed != owner:
        # Not fatal: the header wins and the ticket is still filed. Logging it
        # because a mismatch means a caller is setting the field itself, which is
        # exactly the thing this makes harmless.
        log.warning(
            "ticket create: body claimed owner %s but header said %s; using the header",
            claimed,
            owner,
        )

    ticket = await store.insert(_clean(payload, owner=owner))
    log.info(
        "ticket %s created: %s / %s",
        ticket.id,
        ",".join(s.value for s in ticket.support_needed),
        ticket.urgency.value,
    )
    return ticket


@router.get("", response_model=TicketListResponse, summary="List tickets (admin)")
async def list_tickets(
    request: Request,
    status_filter: TicketStatus | None = Query(
        default=None,
        alias="status",
        description="Filter by lifecycle status.",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> TicketListResponse:
    """
    The whole queue, every victim's details.

    Enforced entirely by the caller: `app/api/ai/admin/tickets/route.ts` runs
    `requireAdmin()` server-side before forwarding here, and the browser cannot
    reach this URL at all because `AI_API_URL` never leaves the server. That is
    the entire access control, so this service must stay on a private network —
    if you ever bind it to a public interface, add a check here first. See the
    module docstring on `app/api/ai/admin/tickets/route.ts`.
    """
    store = _store(request)
    total, page = await store.list(status=status_filter, limit=limit, offset=offset)
    return TicketListResponse(total=total, tickets=page)


@router.get("/stats", response_model=TicketStats, summary="Ticket counts (admin)")
async def ticket_stats(request: Request) -> TicketStats:
    return TicketStats(**await _store(request).stats())


# ---------------------------------------------------------------------- #
# Follow-up
#
# Scoped by `owner_email` on the way in and out. The service itself has no
# authentication of any kind — it is only reachable through the Next.js proxy,
# which resolves the httpOnly session cookie and passes the address down in the
# `x-ticket-owner` header. That header is the whole trust boundary, so it is
# never read from a query string or a request body: both are values the client
# chose, and the body field in particular would be forgeable.
#
# `/mine` is declared *before* `/{ticket_id}` on purpose. FastAPI matches in
# declaration order, so a `/mine` route below the parameterised one would be
# unreachable — it would be read as a ticket whose id happens to be "mine", and
# answered 404.
# ---------------------------------------------------------------------- #

_OWNER_HEADER = "x-ticket-owner"


@router.get(
    "/mine", response_model=TicketListResponse, summary="Tickets filed by one account"
)
async def list_my_tickets(
    request: Request,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> TicketListResponse:
    # `_store` first, before the header check, so an unreachable database is
    # reported as 503 rather than as a missing account. Ordering these the other
    # way round made a database outage indistinguishable from a signed-out
    # visitor, and the reporter's own list is precisely where that is least
    # acceptable.
    store = _store(request)
    owner = _request_owner(request)
    if owner is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No account on this request.",
        )
    total, page = await store.list_for_owner(owner, limit=limit, offset=offset)
    return TicketListResponse(total=total, tickets=page)


@router.post(
    "/claim",
    response_model=Ticket,
    summary="Attach a ticket you filed signed out to your account",
)
async def claim_ticket(payload: TicketClaim, request: Request) -> Ticket:
    """
    Recover an orphaned ticket by proving you are the person who filed it.

    Anonymous intake is a supported path, but a ticket filed without an account
    belongs to nobody and so could never be reopened — not by the reporter, not
    by anyone. This is the way back, and the proof is the reporter's own phone
    number: the reference alone is guessable because the ids are sequential, and
    the phone is something the caller had to know already, because they typed it
    into the ticket.

    Deliberately declared *above* the `/{ticket_id}` routes below. There is no
    `POST /tickets/{ticket_id}` today so nothing can actually shadow this, but
    the ordering costs nothing and removes the need to keep re-deriving that.

    Every failure is one identical 404. A caller must not be able to tell a
    wrong phone from a wrong reference, and neither may tell whether a given
    reference exists at all — which is why this cannot report "that ticket
    already has an owner" separately either. The owner comes from the header, so
    the caller can only ever claim *for themselves*.

    The one thing that is reported separately is an unreachable database, which
    is a 503 rather than a 404. That is not a hole in the rule above: 404 here
    means "no claimable ticket matches", and a database outage must not be
    allowed to say that, because the reporter would conclude the ticket they
    filed anonymously does not exist. A 503 describes the server rather than any
    ticket, so it tells a caller nothing they could have guessed row by row.
    """
    # `_store` before the owner check, for the same reason as `/mine`: with the
    # database down this used to answer 404, telling someone who had just filed
    # anonymously that their ticket did not exist. The 503 says "nothing was
    # saved, try again", which is the truth. It discloses nothing about any
    # ticket — it is the state of the server, not an answer about a row.
    store = _store(request)
    owner = _request_owner(request)
    if not owner:
        # Claiming exists to attach a ticket to an account, so an anonymous
        # caller has nothing to attach it to. Same wording as every other
        # failure below: one message for all of them.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=_CLAIM_REFUSED
        )
    # `normalise_phone` on the submitted value, because the stored one is already
    # normalised and a reporter who retypes "07700 900123" must still match the
    # "07700900123" that was saved. Without this, correct users get locked out of
    # their own ticket over a space.
    ticket = await store.claim(
        payload.ticket_id.strip(), owner, normalise_phone(payload.reporter_phone)
    )
    if ticket is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=_CLAIM_REFUSED
        )
    return ticket


@router.get(
    "/{ticket_id}",
    response_model=Ticket,
    summary="Fetch one ticket you filed",
)
async def get_ticket(ticket_id: str, request: Request) -> Ticket:
    """
    One ticket, readable only by the account that filed it.

    Owner-scoped for the same reason as `/{ticket_id}/messages` below, and with
    the same 404-not-403 answer. This endpoint used to return any ticket to
    anyone who asked, which over a sequential id space is a complete dump of
    everyone's name, phone number and address. Nothing proxies it any more — the
    Next route reads the conversation endpoint, which returns the ticket as part
    of the conversation — but it is kept and locked rather than deleted, so it
    stays usable for debugging from inside the service's own network.
    """
    store = _store(request)
    ticket = await store.get(ticket_id)
    if ticket is None or not _owns(ticket, _request_owner(request)):
        raise HTTPException(status_code=404, detail=f"No ticket with id {ticket_id}.")
    return ticket


@router.patch(
    "/{ticket_id}/status", response_model=Ticket, summary="Advance a ticket (admin)"
)
async def update_status(
    ticket_id: str, payload: StatusUpdate, request: Request
) -> Ticket:
    ticket = await _store(request).update_status(ticket_id, payload.status)
    if ticket is None:
        raise HTTPException(status_code=404, detail=f"No ticket with id {ticket_id}.")
    log.info("ticket %s -> %s", ticket_id, payload.status.value)
    return ticket


@router.get(
    "/{ticket_id}/messages",
    response_model=TicketConversation,
    summary="Read a ticket and its follow-up conversation",
)
async def get_conversation(ticket_id: str, request: Request) -> TicketConversation:
    store = _store(request)
    ticket = await store.get(ticket_id)
    if ticket is None or not _owns(ticket, _request_owner(request)):
        # 404, not 403. A 403 would confirm the id exists, which turns this into
        # an enumeration oracle over a sequential id space — and the ids are
        # `TKT-000001`, `TKT-000002`, and so on.
        raise HTTPException(status_code=404, detail=f"No ticket with id {ticket_id}.")
    return TicketConversation(
        ticket=ticket, messages=await store.messages(ticket_id)
    )


@router.post(
    "/{ticket_id}/messages",
    response_model=FollowUpResponse,
    summary="Ask about a ticket you filed",
)
async def post_message(
    ticket_id: str, payload: FollowUpRequest, request: Request
) -> FollowUpResponse:
    store = _store(request)
    ticket = await store.get(ticket_id)
    if ticket is None or not _owns(ticket, _request_owner(request)):
        raise HTTPException(status_code=404, detail=f"No ticket with id {ticket_id}.")
    return await _follow_up(request).reply(ticket, payload)


def _request_owner(request: Request) -> str | None:
    raw = request.headers.get(_OWNER_HEADER)
    if not raw:
        return None
    return raw.strip().lower() or None


def _owns(ticket: Ticket, owner_email: str | None) -> bool:
    """
    Whether `owner_email` filed this ticket.

    A ticket with no owner belongs to nobody, and therefore to no caller here.
    Anonymous intake is a real and supported path, and it deliberately has no
    portal: a ticket filed signed out cannot be reopened later by anyone,
    including by guessing its id.

    Both sides are lowercased rather than trusting that the writer normalised
    them. `_clean_email` does normalise on insert, so a mixed-case stored value
    should not exist — but the cost of being wrong here is that someone is locked
    out of their own request during a disaster, and the cost of the comparison is
    nothing.
    """
    if not ticket.owner_email or not owner_email:
        return False
    return ticket.owner_email.strip().lower() == owner_email.strip().lower()


def _clean(payload: TicketCreate, *, owner: str | None = None) -> TicketCreate:
    """
    Trim whitespace and tidy phone numbers before persisting.

    `owner` overrides whatever the payload carried — see `create_ticket`. Passing
    it as an explicit argument rather than reading it back off the payload keeps
    the authority for this field in one visible place instead of spread across
    the two.
    """
    return payload.model_copy(
        update={
            "reporter_name": payload.reporter_name.strip(),
            "reporter_phone": normalise_phone(payload.reporter_phone),
            "victim_name": payload.victim_name.strip(),
            "victim_phone": normalise_phone(payload.victim_phone),
            "summary": payload.summary.strip(),
            "location": payload.location.strip(),
            "notes": payload.notes.strip(),
            "owner_email": owner,
        }
    )
