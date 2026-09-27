"""
Chat orchestration: one assistant turn, plus a deterministic degraded path.

`ChatService.respond` is the only place that talks to Gemini. It is responsible
for three things the model should not be:

  1. Re-deriving readiness with `slots.py`, ignoring the model's opinion.
  2. Merging any hand-edited draft back in ahead of the model, so a correction
     a human made in the review form is never quietly reverted.
  3. Degrading to a usable reply when Gemini is unreachable.

On (3): the demo has to survive the backend being down, restarted, or
rate-limited, so a failure produces a *usable* turn rather than an error — the
caller still gets a prompt asking for the most important missing attribute. The
response is flagged `degraded` and the UI says so out loud; silently faking an
AI reply would be worse than useless to someone in an emergency.
"""

from __future__ import annotations

import logging
import re

from pydantic import ValidationError

from .config import Settings
from .gemini import Gemini, GeminiError
from .prompts import SYSTEM_INSTRUCTION, build_response_schema, build_user_text
from .schemas import (
    ChatRequest,
    ChatResponse,
    SlotName,
    TicketDraft,
    Urgency,
)
from .slots import missing_slots, normalise_phone, slot_states

log = logging.getLogger(__name__)

# Shown when Gemini cannot be reached. Asks for the single most valuable
# missing attribute rather than a generic error.
_DEGRADED_PROMPTS: dict[SlotName, str] = {
    SlotName.LOCATION: (
        "I have your message but I lost my connection to the relief network, so I "
        "could not read it properly. Can you tell me exactly where the person who "
        "needs help is — street, building, and floor if you know it?"
    ),
    SlotName.REPORTER_NAME: (
        "I have your message but I lost my connection to the relief network for a "
        "moment. What is your name, so the team knows who to come back to?"
    ),
    SlotName.REPORTER_PHONE: (
        "I have your message but I lost my connection to the relief network for a "
        "moment. What is the best phone number to reach you on?"
    ),
    SlotName.SUMMARY: (
        "I have your message but I lost my connection to the relief network for a "
        "moment. In one or two sentences, what is happening and what do they need?"
    ),
    SlotName.SUPPORT_NEEDED: (
        "I have your message but I lost my connection to the relief network for a "
        "moment. What do they need most — rescue, food, clothing or housing, "
        "medical help, or protection from other people?"
    ),
    SlotName.URGENCY: (
        "I have your message but I lost my connection to the relief network for a "
        "moment. Is anyone in danger right now, or can this wait an hour or two?"
    ),
    SlotName.VICTIM_NAME: (
        "I have your message but I lost my connection to the relief network for a "
        "moment. What is the full name of the person who needs help?"
    ),
    SlotName.VICTIM_PHONE: (
        "I have your message but I lost my connection to the relief network for a "
        "moment. What is a phone number for the person who needs help?"
    ),
    SlotName.PEOPLE_AFFECTED: (
        "I have your message but I lost my connection to the relief network for a "
        "moment. How many people need help?"
    ),
}

# Phrases that mean "life at risk right now", used only by the degraded path so
# an unreachable model still produces a sane urgency signal.
_CRITICAL_PATTERNS = re.compile(
    r"\b(not breathing|unconscious|unresponsive|trapped|buried|collapse[ds]?|"
    r"bleeding|drowning|chest pain|seizure|gas leak|fire|explosion|"
    r"can't walk|cannot walk|gun|armed|attacked)\b",
    re.IGNORECASE,
)


class ChatService:
    def __init__(self, settings: Settings, gemini: Gemini) -> None:
        self._settings = settings
        self._gemini = gemini

    async def respond(self, request: ChatRequest) -> ChatResponse:
        transcript = [(m.role, m.text) for m in request.messages]
        merged_edits = _clean_edits(request.edited_draft)
        confirmed = _clean_facts(request.known_facts)

        try:
            payload, model = await self._gemini.generate_json(
                system_instruction=SYSTEM_INSTRUCTION,
                user_text=build_user_text(
                    transcript,
                    merged_edits,
                    confirmed,
                    request.context,
                ),
                response_schema=build_response_schema(),
            )
        except GeminiError as exc:
            log.warning("falling back to degraded reply: %s", exc)
            return self._degraded(request, str(exc))

        draft = _draft_from_payload(payload)
        draft = _apply_edits(draft, merged_edits)
        draft.reporter_phone = normalise_phone(draft.reporter_phone)
        draft.victim_phone = normalise_phone(draft.victim_phone)

        return self._to_response(
            reply=str(payload.get("reply") or "").strip()
            or "Thank you — I am recording that now.",
            draft=draft,
            next_questions=_parse_next_questions(payload.get("nextQuestions")),
            safety_note=str(payload.get("safetyNote") or "").strip(),
            confidence=_parse_confidence(payload.get("confidence")),
            model=model,
            degraded=False,
        )

    # ---- degraded path ------------------------------------------------ #

    def _degraded(self, request: ChatRequest, reason: str) -> ChatResponse:
        last_user_text = next(
            (text for role, text in reversed(request.messages) if role == "user"), ""
        )
        support: list[str] = []
        if _CRITICAL_PATTERNS.search(last_user_text):
            support = ["medical", "rescue"]

        draft = TicketDraft(
            summary=last_user_text[:500],
            support_needed=support,  # type: ignore[arg-type]
            urgency=Urgency.CRITICAL if support else None,
        )

        # Hand edits are applied here too, not only on the success path. They are
        # the reporter's corrections, and `missing` is computed from this draft —
        # so dropping them would make a field they already fixed reappear as
        # "needed", and the intake could not be completed until Gemini recovered.
        # An outage must not cost the reporter the one thing only they know.
        draft = _apply_edits(draft, _clean_edits(request.edited_draft))
        draft.reporter_phone = normalise_phone(draft.reporter_phone)
        draft.victim_phone = normalise_phone(draft.victim_phone)

        missing = missing_slots(draft)
        # Ask about the most urgent gap we know how to prompt for.
        priority_order: tuple[SlotName, ...] = (
            SlotName.LOCATION,
            SlotName.REPORTER_NAME,
            SlotName.REPORTER_PHONE,
            SlotName.SUMMARY,
            SlotName.SUPPORT_NEEDED,
            SlotName.URGENCY,
        )
        ask = next((slot for slot in priority_order if slot in missing), None)
        reply = _DEGRADED_PROMPTS.get(
            ask,
            "I have your message. Could you tell me once more what you need and "
            "where the person is?",
        )

        log.info("degraded turn served (%s)", reason)
        return self._to_response(
            reply=reply,
            draft=draft,
            next_questions=[ask] if ask else [],
            safety_note=(
                "If someone is in immediate danger, call your local emergency "
                "number now."
            ),
            confidence=0.0,
            model="",
            degraded=True,
        )

    # ---- shared ------------------------------------------------------- #

    def _to_response(
        self,
        *,
        reply: str,
        draft: TicketDraft,
        next_questions: list[SlotName],
        safety_note: str,
        confidence: float,
        model: str,
        degraded: bool,
    ) -> ChatResponse:
        # Readiness is always recomputed here. The model is never asked whether
        # the ticket is submittable.
        states = slot_states(draft)
        missing = missing_slots(draft)
        complete = not missing
        return ChatResponse(
            reply=reply,
            draft=draft,
            slots=states,
            missing=missing,
            # A complete draft has nothing left to ask about.
            next_questions=[] if complete else next_questions[:2],
            is_complete=complete,
            safety_note=safety_note,
            confidence=confidence,
            model=model,
            degraded=degraded,
        )


# ---------------------------------------------------------------------- #
# Payload parsing
# ---------------------------------------------------------------------- #


def _draft_from_payload(payload: dict) -> TicketDraft:
    """
    Build a `TicketDraft` from whatever shape the model actually returned.

    Constrained decoding makes invalid values rare but not impossible (a model
    can still emit `"urgency": "urgent"`). Rather than letting that 500 the
    request, offending fields are dropped one at a time until the draft
    validates — the affected slot then simply reads as unanswered and the
    assistant asks for it again, which is the correct recovery.
    """
    raw = payload.get("draft")
    if not isinstance(raw, dict):
        raw = {}
    # Accept both camelCase (as prompted) and snake_case, so a model that
    # switches conventions mid-conversation still lands in the right slot.
    normalised = {
        (k if k in _DRAFT_FIELDS else _CAMEL_TO_SNAKE.get(k, k)): v
        for k, v in raw.items()
        if (k in _DRAFT_FIELDS or k in _CAMEL_TO_SNAKE)
    }

    attempt = dict(normalised)
    while True:
        try:
            return TicketDraft.model_validate(attempt)
        except ValidationError as exc:
            broken = {str(e["loc"][0]) for e in exc.errors() if e.get("loc")}
            droppable = broken & set(attempt)
            if not droppable:
                # Nothing left to shed that we recognise; take the safe subset.
                log.warning("unrecoverable draft payload: %s", exc.errors()[:2])
                return TicketDraft()
            for key in droppable:
                log.info("dropping unusable draft field %r from model output", key)
                attempt.pop(key, None)


_DRAFT_FIELDS = {
    "reporter_name",
    "reporter_phone",
    "victim_name",
    "victim_phone",
    "summary",
    "location",
    "people_affected",
    "notes",
    "on_behalf_of_other",
    "urgency",
    "support_needed",
}

_CAMEL_TO_SNAKE = {
    "reporterName": "reporter_name",
    "reporterPhone": "reporter_phone",
    "victimName": "victim_name",
    "victimPhone": "victim_phone",
    "peopleAffected": "people_affected",
    "onBehalfOfOther": "on_behalf_of_other",
    "supportNeeded": "support_needed",
}


def _parse_next_questions(value: object) -> list[SlotName]:
    if not isinstance(value, list):
        return []
    out: list[SlotName] = []
    for item in value:
        try:
            slot = SlotName(str(item))
        except ValueError:
            continue
        if slot not in out:
            out.append(slot)
    return out


def _parse_confidence(value: object) -> float:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, number))


def _clean_edits(edits: dict[str, str] | None) -> dict[str, str] | None:
    if not edits:
        return None
    cleaned = {k: str(v).strip() for k, v in edits.items() if str(v).strip()}
    return cleaned or None


def _clean_facts(facts: dict[str, str] | None) -> dict[str, str] | None:
    """
    Trim the confirmed-facts block the client sends alongside a bounded window.

    Only real `SlotName` keys survive. The value is interpolated into the model
    prompt, so an arbitrary caller-supplied key is both noise and a small
    prompt-injection surface — this block is context, not instruction.
    """
    if not facts:
        return None
    known = {s.value for s in SlotName}
    cleaned = {
        k: str(v).strip()
        for k, v in facts.items()
        if k in known and str(v).strip()
    }
    return cleaned or None


def _apply_edits(draft: TicketDraft, edits: dict[str, str] | None) -> TicketDraft:
    """
    Overlay hand-edited values onto the model output.

    The human wins. A correction made in the review form has to survive the next
    assistant turn, otherwise editing a field and then answering the
    assistant's next question would silently revert it.

    The key set below is deliberately exhaustive over what the client can send,
    and it is a `match` with no `case _` precisely so that a new editable field
    fails loudly here rather than silently in production. Two fields are
    intentionally absent, for opposite reasons:

      - `supportNeeded` is a *choice* rather than a correction. The client drops
        it from `edits` on every toggle, so a reporter picking between options
        the model offered must not then pin the model to that pick.
      - `peopleAffected` is present but free text, so it is assigned verbatim
        and coerced later by `TicketCreate`.

    An arm that is missing does not raise — it falls through the match and the
    edit is dropped without a trace, which is exactly how `urgency` came to be
    silently reverted for a reporter who had raised it to `critical` themselves.
    If you add an editable field on the client, add it here, and add it to
    `test_intake_rules.py` at the same time.
    """
    if not edits:
        return draft
    for key, value in edits.items():
        match key:
            case "reporterName":
                draft.reporter_name = value
            case "reporterPhone":
                draft.reporter_phone = value
            case "victimName":
                draft.victim_name = value
            case "victimPhone":
                draft.victim_phone = value
            case "summary":
                draft.summary = value
            case "location":
                draft.location = value
            case "peopleAffected":
                draft.people_affected = value
            case "notes":
                draft.notes = value
            case "urgency":
                # Coerced through the enum, never assigned raw. `urgency` is the
                # field triage reads first, so an unvalidated string here would
                # either raise later in `_to_ticket` or, worse, persist a value
                # outside the vocabulary the whole system agrees on.
                #
                # An unrecognised value keeps whatever the model said. That is
                # deliberate: silently ignoring a bad correction is recoverable,
                # whereas writing garbage into a triage field is not — and the
                # reporter still sees the value the model chose on the next
                # turn, so the discrepancy is visible rather than hidden.
                try:
                    draft.urgency = Urgency(value.strip().lower())
                except ValueError:
                    log.warning(
                        "edited urgency %r is not one of %s; keeping %r",
                        value,
                        ", ".join(u.value for u in Urgency),
                        draft.urgency,
                    )
    return draft
