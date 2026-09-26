"""
FastAPI application for the FLARE AI chat and relief-ticket intake.

Responsibilities kept deliberately narrow:

  * own the Gemini client and the Postgres pool for the process lifetime
  * expose `/api/chat/message`, `/api/tickets*`, `/api/health`, `/api/ready`
  * nothing about the Next.js app's rendering, types or styling

The Next.js side reaches this service through its own `/api/ai/*` proxy
routes, so the browser never holds the Gemini key and never needs CORS in
production. CORS is still enabled for the configured dev origins so the service
can be poked directly with curl during development.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .chat_service import ChatService
from .config import get_settings
from .db import TicketStore
from .follow_up_service import FollowUpService
from .gemini import Gemini
from .routers import chat, health, tickets

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("flare.ai")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()

    gemini = Gemini(settings)
    await gemini.__aenter__()

    store = TicketStore(settings)
    # A missing database is fatal for ticket creation but must not stop the
    # process: the chat can still run and a user asking for a rescue should
    # never get a connection-refused page. `/api/ready` reports the difference.
    try:
        await store.connect()
    except Exception as exc:  # noqa: BLE001 - logged, not raised
        log.error("postgres unavailable, ticket creation disabled: %s", exc)

    app.state.settings = settings
    app.state.gemini = gemini
    app.state.tickets = store
    app.state.chat = ChatService(settings, gemini)
    app.state.follow_up = FollowUpService(settings, gemini, store)

    if not settings.has_gemini_key:
        log.warning("GEMINI_API_KEY is not set - every chat turn will be degraded.")
    log.info("FLARE AI backend %s ready", __version__)

    try:
        yield
    finally:
        await store.close()
        await gemini.__aexit__(None, None, None)


app = FastAPI(
    title="FLARE AI Backend",
    version=__version__,
    summary="Gemini-backed relief chat that turns a conversation into a ticket.",
    lifespan=lifespan,
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(get_settings().cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(health.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(tickets.router, prefix="/api")


@app.get("/", include_in_schema=False)
async def root() -> dict[str, str]:
    return {"service": "flare-ai-backend", "docs": "/docs", "health": "/api/health"}
