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
from ..schemas import (
    Ticket,
    TicketCreate,
    TicketDraft,
    TicketListResponse,
    TicketStatus,
)
from ..slots import missing_slots, normalise_phone

log = logging.getLogger(__name__)

router = APIRouter(prefix="/tickets", tags=["tickets"])


class StatusUpdate(BaseModel):
    status: TicketStatus


class TicketStats(BaseModel):
    total: int
    by_status: dict[str, int]
    by_urgency: dict[str, int]
    by_support: dict[str, int]


def _store(request: Request) -> TicketStore:
    return request.app.state.tickets


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

    ticket = await store.insert(_clean(payload))
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
    store = _store(request)
    total, page = await store.list(status=status_filter, limit=limit, offset=offset)
    return TicketListResponse(total=total, tickets=page)


@router.get("/stats", response_model=TicketStats, summary="Ticket counts (admin)")
async def ticket_stats(request: Request) -> TicketStats:
    return TicketStats(**await _store(request).stats())


@router.get("/{ticket_id}", response_model=Ticket, summary="Fetch one ticket")
async def get_ticket(ticket_id: str, request: Request) -> Ticket:
    ticket = await _store(request).get(ticket_id)
    if ticket is None:
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


def _clean(payload: TicketCreate) -> TicketCreate:
    """Trim whitespace and tidy phone numbers before persisting."""
    return payload.model_copy(
        update={
            "reporter_name": payload.reporter_name.strip(),
            "reporter_phone": normalise_phone(payload.reporter_phone),
            "victim_name": payload.victim_name.strip(),
            "victim_phone": normalise_phone(payload.victim_phone),
            "summary": payload.summary.strip(),
            "location": payload.location.strip(),
            "notes": payload.notes.strip(),
        }
    )
