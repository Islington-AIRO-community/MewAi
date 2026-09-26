"""
Wire schemas for the AI chat and ticket endpoints.

`TicketDraft` is the contract between Gemini and this service: every field is a
string, and an empty string means "not captured yet". Keeping unknowns as empty
strings (rather than `null` or omitted keys) means the model never has to
decide *how* to express a gap, and the review form can bind to a stable shape.

Whether those empty strings are *acceptable* is decided in `tickets.py`, not by
the model — the "a ticket must have these attributes" rule is a business
invariant, so it belongs in code we can test.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------- #
# Taxonomy
# ---------------------------------------------------------------------- #


class SupportType(str, Enum):
    """The four support classes a victim can be routed to."""

    RESCUE = "rescue"
    RELIEF_SUPPLIES = "relief-supplies"  # food, clothing, temporary housing
    MEDICAL = "medical"
    SECURITY = "security"


class Urgency(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class TicketStatus(str, Enum):
    """Lifecycle. Admin-side transitions come later; the reporter only submits."""

    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    DISPATCHED = "dispatched"
    RESOLVED = "resolved"
    CLOSED = "closed"


class SlotName(str, Enum):
    """The individual facts a ticket cannot be created without."""

    REPORTER_NAME = "reporterName"
    REPORTER_PHONE = "reporterPhone"
    VICTIM_NAME = "victimName"
    VICTIM_PHONE = "victimPhone"
    SUMMARY = "summary"
    LOCATION = "location"
    SUPPORT_NEEDED = "supportNeeded"
    URGENCY = "urgency"
    PEOPLE_AFFECTED = "peopleAffected"


class CaptureState(str, Enum):
    CAPTURED = "captured"
    NEEDED = "needed"
    UNKNOWN = "unknown"


# ---------------------------------------------------------------------- #
# Chat
# ---------------------------------------------------------------------- #


class ChatMessageIn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    text: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    """One assistant turn. The client replays the transcript it already has."""

    messages: list[ChatMessageIn] = Field(min_length=1, max_length=60)
    # The session's own identifier so the backend can keep a server-side record
    # of the conversation even though the browser owns the visible transcript.
    session_id: str | None = Field(default=None, max_length=64)
    # Set by the client once the user has edited a draft and asked to continue:
    # lets the model know the human is the source of truth for those values.
    edited_draft: dict[str, str] | None = None
    # Slots the model has already confirmed, keyed by `SlotName`.
    #
    # This is what makes a bounded transcript safe. The client keeps only the
    # most recent turns so the request cannot grow without limit, and everything
    # older survives here as a structured value — which is both a smaller and a
    # more reliable summary of turn 4 than turn 4's prose is.
    known_facts: dict[str, str] | None = None
    # Things the reporter did rather than said, e.g. the category tile they
    # arrived through. Rendered as context, never as an utterance: the reporter
    # did not type these, and presenting them as something they said would be a
    # fabrication the model then reasons from.
    context: list[str] | None = Field(default=None, max_length=8)


class TicketDraft(BaseModel):
    """Model output. Empty string == not captured."""

    reporter_name: str = ""
    reporter_phone: str = ""
    victim_name: str = ""
    victim_phone: str = ""
    summary: str = ""
    location: str = ""
    people_affected: str = ""
    support_needed: list[SupportType] = Field(default_factory=list)
    urgency: Urgency | None = None
    # True when the person typing is reporting for someone else, which is what
    # makes the victim name and victim phone mandatory.
    on_behalf_of_other: bool = False
    notes: str = ""

    @field_validator(
        "reporter_name",
        "reporter_phone",
        "victim_name",
        "victim_phone",
        "summary",
        "location",
        "people_affected",
        "notes",
        mode="before",
    )
    @classmethod
    def _none_to_empty(cls, v: object) -> str:
        """The model likes to emit null for gaps; normalise to ""."""
        return "" if v is None else str(v)


class ChatResponse(BaseModel):
    """Everything the chat needs to render a turn."""

    reply: str
    draft: TicketDraft
    # Slot name -> captured / needed / unknown. Drives the checklist UI.
    slots: dict[SlotName, CaptureState]
    # Slots still blocking submission. Empty means the review form can open.
    missing: list[SlotName]
    # At most two questions per turn — a phone screen can absorb two, not nine.
    next_questions: list[SlotName]
    is_complete: bool
    # "Go to higher ground" / "call your local emergency number" style advice.
    safety_note: str = ""
    # The model states its own extraction confidence; the UI shows it as a hint.
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    model: str = ""
    # Set when Gemini was unreachable and the caller is looking at a fallback.
    degraded: bool = False


# ---------------------------------------------------------------------- #
# Tickets
# ---------------------------------------------------------------------- #


class TicketCreate(BaseModel):
    """What the review form submits. Validated, not trusted."""

    reporter_name: str = Field(min_length=1, max_length=120)
    reporter_phone: str = Field(min_length=6, max_length=40)
    victim_name: str = Field(default="", max_length=120)
    victim_phone: str = Field(default="", max_length=40)
    summary: str = Field(min_length=1, max_length=4000)
    location: str = Field(min_length=1, max_length=400)
    people_affected: int | None = Field(default=None, ge=0, le=100_000)
    support_needed: list[SupportType] = Field(min_length=1, max_length=4)
    urgency: Urgency
    on_behalf_of_other: bool = False
    notes: str = Field(default="", max_length=2000)
    source: str = Field(default="ai-chat", max_length=32)
    session_id: str | None = Field(default=None, max_length=64)
    owner_email: str | None = Field(default=None, max_length=254)

    @field_validator("people_affected", mode="before")
    @classmethod
    def _parse_people(cls, v: object) -> object:
        if v is None or v == "":
            return None
        if isinstance(v, str):
            digits = "".join(ch for ch in v if ch.isdigit())
            return int(digits) if digits else None
        return v

    def validation_errors(self) -> list[str]:
        """
        Post-model rules the pydantic schema cannot express on its own.

        The victim's name and number are mandatory exactly when a relative is
        filing on their behalf — the one conditional requirement in the spec.
        """
        errors: list[str] = []
        if self.on_behalf_of_other:
            if not self.victim_name.strip():
                errors.append("victimName is required when reporting for someone else.")
            if not self.victim_phone.strip():
                errors.append("victimPhone is required when reporting for someone else.")
        return errors


class TicketClaim(BaseModel):
    """
    Proof that the caller is the person who filed an orphaned ticket.

    `reporter_phone` is the second factor, and it is not a guess the caller has
    to invent: it is the number they already typed into the ticket. Knowing the
    reference alone is not enough, and the reference alone is guessable, because
    the ids are sequential.
    """

    ticket_id: str = Field(min_length=1, max_length=32)
    reporter_phone: str = Field(min_length=6, max_length=40)


class Ticket(BaseModel):
    """A stored ticket, as returned by the API."""

    id: str
    created_at: datetime
    updated_at: datetime
    status: TicketStatus
    reporter_name: str
    reporter_phone: str
    victim_name: str
    victim_phone: str
    summary: str
    location: str
    people_affected: int | None
    support_needed: list[SupportType]
    urgency: Urgency
    on_behalf_of_other: bool
    notes: str
    source: str
    session_id: str | None
    owner_email: str | None


class TicketListResponse(BaseModel):
    """Listing for the admin work that comes next."""

    total: int
    tickets: list[Ticket]


# ---------------------------------------------------------------------- #
# Follow-up conversation
# ---------------------------------------------------------------------- #


class TicketMessage(BaseModel):
    """One turn of the conversation attached to a ticket."""

    id: int
    ticket_id: str
    role: str
    text: str
    created_at: datetime


class TicketConversation(BaseModel):
    """
    A ticket together with its follow-up history.

    One call rather than two, because the portal needs both and the reporter
    should not have to wait on two round trips to render a page they may be
    reading on a phone with one bar of signal.
    """

    ticket: Ticket
    messages: list[TicketMessage]


class FollowUpRequest(BaseModel):
    """A reporter's follow-up question about a ticket they already filed."""

    message: str = Field(min_length=1, max_length=2000)


class FollowUpResponse(BaseModel):
    """
    The assistant's answer about a known ticket.

    `status` is echoed from the row rather than asked of the model, and so is
    every fact in `ticket`. The model is given the ticket as context and asked
    what it means; it is never asked to decide any of it. A response that
    invents "a crew is on the way" when the row says `submitted` is the single
    worst output this service could produce.
    """

    reply: str
    status: TicketStatus
    status_detail: str
    ticket: Ticket
    degraded: bool
    model: str
    safety_note: str = ""
