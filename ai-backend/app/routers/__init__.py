"""Routers. One module per resource, all mounted under `/api`."""

from __future__ import annotations

from . import chat, health, tickets

__all__ = ["chat", "health", "tickets"]
