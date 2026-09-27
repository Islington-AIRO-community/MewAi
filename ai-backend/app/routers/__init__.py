"""Routers. One module per resource, all mounted under `/api`."""

from __future__ import annotations

from . import chat, health, live, tickets

__all__ = ["chat", "health", "live", "tickets"]
