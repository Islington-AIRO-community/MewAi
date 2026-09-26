"""
Follow-up conversation on an existing ticket.

The second thing a reporter can do after filing, alongside checking the status:
add a message to the ticket and get an answer about it.

This is deliberately a *different* service from `ChatService` rather than a mode
of it. The intake asks questions and fills slots; this answers questions about a
row that already exists. Sharing the code would mean sharing the prompt, and the
intake prompt is written to be overruled by application code on the one question
that matters here — whether a ticket is submittable. A follow-up prompt needs the
opposite instruction: state nothing that was not given to you.

Two invariants, both enforced here rather than left to the prompt:

  1. **The status is never model output.** `ticket.status` is read from the row
     and echoed. The model is handed the status as an input fact and asked what
     it means, so the UI badge and the assistant's answer cannot disagree.

  2. **The reporter's words are stored before the model is called.** If Gemini
     then fails, the turn still exists and an operator can see what was asked.
     A follow-up channel that drops messages during an outage is worse than one
     that cannot answer them.
"""

from __future__ import annotations

import logging

from .config import Settings
from .db import TicketStore
from .follow_up_prompts import (
    FOLLOW_UP_SCHEMA,
    FOLLOW_UP_SYSTEM_INSTRUCTION,
    build_follow_up_user_text,
    degraded_reply,
    status_detail,
)
from .gemini import Gemini, GeminiError
from .schemas import FollowUpRequest, FollowUpResponse, Ticket

log = logging.getLogger(__name__)


class FollowUpService:
    def __init__(
        self, settings: Settings, gemini: Gemini, store: TicketStore
    ) -> None:
        self._settings = settings
        self._gemini = gemini
        self._store = store

    async def reply(
        self, ticket: Ticket, request: FollowUpRequest
    ) -> FollowUpResponse:
        question = request.message.strip()

        # Persist the question first. See invariant 2 in the module docstring.
        stored = await self._store.add_message(ticket.id, "user", question)
        # ...and then read the thread back *without* it. The prompt appends the
        # new question itself, so replaying a history that already contains it
        # would show the model the same line twice on every single turn. Excluded
        # by id rather than by position, because the store returns the row it
        # inserted and a slice would break the moment two turns interleaved.
        history = [
            message
            for message in await self._store.messages(ticket.id)
            if message.id != stored.id
        ]

        try:
            payload, model = await self._gemini.generate_json(
                system_instruction=FOLLOW_UP_SYSTEM_INSTRUCTION,
                user_text=build_follow_up_user_text(ticket, history, question),
                response_schema=FOLLOW_UP_SCHEMA,
            )
        except GeminiError as exc:
            log.warning(
                "follow-up %s falling back to degraded reply: %s", ticket.id, exc
            )
            reply = degraded_reply(ticket.status)
            await self._store.add_message(ticket.id, "assistant", reply)
            return FollowUpResponse(
                reply=reply,
                # Echoed from the row, never from the model. Even the degraded
                # path cannot drift from the database.
                status=ticket.status,
                status_detail=status_detail(ticket.status),
                ticket=ticket,
                degraded=True,
                model="offline",
            )

        reply = str(payload.get("reply") or "").strip()
        if not reply:
            # A model that returned a valid envelope with nothing in it is as
            # useless as one that failed, and it must not leave the transcript
            # with a gap where the answer should be.
            reply = degraded_reply(ticket.status)
            await self._store.add_message(ticket.id, "assistant", reply)
            return FollowUpResponse(
                reply=reply,
                status=ticket.status,
                status_detail=status_detail(ticket.status),
                ticket=ticket,
                degraded=True,
                model=model,
            )

        await self._store.add_message(ticket.id, "assistant", reply)
        log.info("follow-up %s answered by %s", ticket.id, model)
        return FollowUpResponse(
            reply=reply,
            status=ticket.status,
            status_detail=status_detail(ticket.status),
            ticket=ticket,
            degraded=False,
            model=model,
            # The model is *required* to return this, so dropping it would
            # discard the one signal that outranks a helpful answer. Carried
            # through untouched and rendered above the reply, exactly as the
            # intake envelope's `safety_note` is. Empty on the degraded paths
            # below because the offline set makes no safety judgement.
            safety_note=str(payload.get("safetyNote") or "").strip(),
        )
