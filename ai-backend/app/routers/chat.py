"""`POST /api/chat/message` — one assistant turn of ticket intake."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request

from ..chat_service import ChatService
from ..schemas import ChatRequest, ChatResponse

log = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/message", response_model=ChatResponse)
async def post_message(payload: ChatRequest, request: Request) -> ChatResponse:
    """
    Advance the intake by one turn.

    The client replays the transcript it already holds; this service is
    stateless per request, which keeps the Next.js app as the single source of
    truth for what the user can see.

    Never returns 5xx for an upstream Gemini problem — `ChatService` converts
    that into a `degraded` turn. A 500 here would mean the browser shows an
    error instead of an assistant that is still asking the right question.
    """
    service: ChatService = request.app.state.chat
    return await service.respond(payload)
