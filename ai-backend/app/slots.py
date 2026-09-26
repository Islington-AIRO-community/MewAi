"""
Slot readiness — the "a ticket MUST have these attributes" rule.

This is the part of the flow that must not be delegated to a language model, so
it lives here in plain Python with no I/O. `POST /api/chat/message` recomputes
it on every turn regardless of what the model claims, and `POST /api/tickets`
applies the same predicate before writing a row.

Spec being enforced:

  1. reporter name and contact number
  2. victim name and number, *when a relative files on someone's behalf*
  3. a summary of what the user described
  4. a creation timestamp   -> stamped server-side at insert, never by the model
  5. the victim's location
  6. at least one support classification out of the four classes
"""

from __future__ import annotations

from .schemas import CaptureState, SlotName, TicketDraft

# Filled by the model and required unconditionally.
ALWAYS_REQUIRED: tuple[SlotName, ...] = (
    SlotName.REPORTER_NAME,
    SlotName.REPORTER_PHONE,
    SlotName.SUMMARY,
    SlotName.LOCATION,
    SlotName.SUPPORT_NEEDED,
    SlotName.URGENCY,
)

# Required only when the reporter is filing for someone else.
ON_BEHALF_REQUIRED: tuple[SlotName, ...] = (
    SlotName.VICTIM_NAME,
    SlotName.VICTIM_PHONE,
)

# Nice to have: asked about, never blocks the review form.
OPTIONAL: tuple[SlotName, ...] = (SlotName.PEOPLE_AFFECTED,)

# A phone number has to look dialable before a crew is told to call it.
_MIN_PHONE_DIGITS = 6


def digits(value: str) -> int:
    return sum(ch.isdigit() for ch in value)


def is_usable_phone(value: str) -> bool:
    return digits(value) >= _MIN_PHONE_DIGITS


def _value_for(draft: TicketDraft, slot: SlotName) -> str:
    match slot:
        case SlotName.REPORTER_NAME:
            return draft.reporter_name
        case SlotName.REPORTER_PHONE:
            return draft.reporter_phone
        case SlotName.VICTIM_NAME:
            return draft.victim_name
        case SlotName.VICTIM_PHONE:
            return draft.victim_phone
        case SlotName.SUMMARY:
            return draft.summary
        case SlotName.LOCATION:
            return draft.location
        case SlotName.PEOPLE_AFFECTED:
            return draft.people_affected
        case SlotName.SUPPORT_NEEDED:
            return "" if not draft.support_needed else ",".join(
                s.value for s in draft.support_needed
            )
        case SlotName.URGENCY:
            return draft.urgency.value if draft.urgency else ""
    return ""  # pragma: no cover - exhaustive match above


def required_slots(draft: TicketDraft) -> tuple[SlotName, ...]:
    """
    The slots blocking submission for this draft.

    Victim slots are conditional; that conditional is the only one in the spec,
    which is why it is expressed here and not in the prompt.
    """
    required = list(ALWAYS_REQUIRED)
    if draft.on_behalf_of_other:
        required.extend(ON_BEHALF_REQUIRED)
    return tuple(required)


def slot_states(draft: TicketDraft) -> dict[SlotName, CaptureState]:
    """Per-slot state, so the UI can render a real checklist."""
    required = set(required_slots(draft))
    states: dict[SlotName, CaptureState] = {}

    for slot in SlotName:
        value = _value_for(draft, slot).strip()
        if not value:
            states[slot] = CaptureState.NEEDED if slot in required else CaptureState.UNKNOWN
            continue
        if slot in (SlotName.REPORTER_PHONE, SlotName.VICTIM_PHONE) and not is_usable_phone(
            value
        ):
            # Something was written but it is not dialable, so it still counts
            # as outstanding rather than captured.
            states[slot] = CaptureState.NEEDED
            continue
        states[slot] = CaptureState.CAPTURED
    return states


def missing_slots(draft: TicketDraft) -> list[SlotName]:
    states = slot_states(draft)
    # Preserve the spec's declared order so the UI checklist is stable rather
    # than reflecting dict insertion order from the enum walk.
    return [slot for slot in required_slots(draft) if states[slot] is not CaptureState.CAPTURED]


def is_complete(draft: TicketDraft) -> bool:
    return not missing_slots(draft)


def normalise_phone(value: str) -> str:
    """
    Tidy a captured number without changing what the user said.

    Strips spaces, dots and brackets (people read numbers aloud with those) and
    collapses runs of hyphens, but leaves a leading `+` and any digits alone.
    """
    cleaned = "".join(
        ch for ch in value.strip() if ch.isdigit() or ch == "+" or ch == "-"
    )
    while "--" in cleaned:
        cleaned = cleaned.replace("--", "-")
    return cleaned
