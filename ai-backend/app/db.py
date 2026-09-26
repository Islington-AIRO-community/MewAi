"""
Postgres access for tickets, via `asyncpg`.

Design notes:

  - The schema is created on startup with idempotent DDL. There is no migration
    tool in this project; adding one is the obvious next step before this holds
    anything real.
  - `support_needed` is a `text[]` rather than a join table. Four fixed
    classes, always read whole, never queried by element — a join table would
    be more ceremony than the query pattern justifies.
  - `session_id` is indexed and nullable so the admin work can later group a
    reporter's whole conversation into one case.
  - `urgency` is stored as text rather than an enum so adding a level is an
    application change, not a `ALTER TYPE` on a live table.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import asyncpg

from .config import Settings
from .schemas import (
    Ticket,
    TicketCreate,
    TicketStatus,
    Urgency,
)

log = logging.getLogger(__name__)

SCHEMA_SQL = """
CREATE SEQUENCE IF NOT EXISTS relief_ticket_seq START 1;

CREATE TABLE IF NOT EXISTS relief_tickets (
    id                  text PRIMARY KEY,
    created_at          timestamptz        NOT NULL DEFAULT now(),
    updated_at          timestamptz        NOT NULL DEFAULT now(),
    status              text               NOT NULL DEFAULT 'submitted',
    reporter_name       text               NOT NULL,
    reporter_phone      text               NOT NULL,
    victim_name         text               NOT NULL DEFAULT '',
    victim_phone        text               NOT NULL DEFAULT '',
    summary             text               NOT NULL,
    location            text               NOT NULL,
    people_affected     integer,
    support_needed      text[]             NOT NULL,
    urgency             text               NOT NULL,
    on_behalf_of_other  boolean            NOT NULL DEFAULT false,
    notes               text               NOT NULL DEFAULT '',
    source              text               NOT NULL DEFAULT 'ai-chat',
    session_id          text
);

CREATE INDEX IF NOT EXISTS relief_tickets_created_at_idx
    ON relief_tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS relief_tickets_status_idx
    ON relief_tickets (status);
CREATE INDEX IF NOT EXISTS relief_tickets_session_idx
    ON relief_tickets (session_id)
    WHERE session_id IS NOT NULL;
"""

_COLUMNS = """
    id, created_at, updated_at, status, reporter_name, reporter_phone,
    victim_name, victim_phone, summary, location, people_affected,
    support_needed, urgency, on_behalf_of_other, notes, source, session_id
"""


class TicketStore:
    """Owns the connection pool. One instance per process, created in lifespan."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pool: asyncpg.Pool | None = None

    # ---- lifecycle ---------------------------------------------------- #

    async def connect(self) -> None:
        if not self._settings.has_database:
            raise RuntimeError(
                "DATABASE_URL is not set. Start Postgres with "
                "`docker compose up -d db` from ai-backend/, or set DATABASE_URL "
                "in ai-backend/.env."
            )
        self._pool = await asyncpg.create_pool(
            dsn=self._settings.database_url,
            min_size=self._settings.db_pool_min_size,
            max_size=self._settings.db_pool_max_size,
            command_timeout=15,
        )
        async with self._pool.acquire() as conn:
            await conn.execute(SCHEMA_SQL)
        log.info("postgres pool ready")

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None

    @property
    def ready(self) -> bool:
        return self._pool is not None

    def _require_pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("Ticket store used before connect().")
        return self._pool

    # ---- writes ------------------------------------------------------- #

    async def insert(self, payload: TicketCreate) -> Ticket:
        """
        Insert a ticket and return it, with the server-stamped timestamps.

        `created_at` / `updated_at` come from `now()` on the database clock, not
        from the request and not from the model — attribute 4 of the spec.
        """
        pool = self._require_pool()
        # Sequence in the FLARE-* id space, allocated from the same counter the
        # Next.js demo store uses for report ids so a ticket and a report created
        # in the same session do not collide.
        async with pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow(
                    """
                    INSERT INTO relief_tickets (
                        id, reporter_name, reporter_phone, victim_name,
                        victim_phone, summary, location, people_affected,
                        support_needed, urgency, on_behalf_of_other, notes,
                        source, session_id
                    )
                    VALUES (
                        'TKT-' || lpad(nextval('relief_ticket_seq')::text, 6, '0'),
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
                    )
                    RETURNING """
                    + _COLUMNS,
                    payload.reporter_name.strip(),
                    payload.reporter_phone.strip(),
                    payload.victim_name.strip(),
                    payload.victim_phone.strip(),
                    payload.summary.strip(),
                    payload.location.strip(),
                    payload.people_affected,
                    [s.value for s in payload.support_needed],
                    payload.urgency.value,
                    payload.on_behalf_of_other,
                    payload.notes.strip(),
                    payload.source,
                    payload.session_id,
                )
        return _to_ticket(row)

    async def update_status(self, ticket_id: str, status: TicketStatus) -> Ticket | None:
        """Admin-side transition. Not wired to any UI yet — this is the hook."""
        pool = self._require_pool()
        row = await pool.fetchrow(
            f"UPDATE relief_tickets SET status = $2, updated_at = now() "
            f"WHERE id = $1 RETURNING {_COLUMNS}",
            ticket_id,
            status.value,
        )
        return _to_ticket(row) if row else None

    # ---- reads -------------------------------------------------------- #

    async def get(self, ticket_id: str) -> Ticket | None:
        pool = self._require_pool()
        row = await pool.fetchrow(
            f"SELECT {_COLUMNS} FROM relief_tickets WHERE id = $1", ticket_id
        )
        return _to_ticket(row) if row else None

    async def list(
        self,
        *,
        status: TicketStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[int, list[Ticket]]:
        """Returns `(total, page)`. `total` ignores limit/offset."""
        pool = self._require_pool()
        where = "WHERE status = $1" if status else ""
        args: list[object] = [status.value] if status else []

        total = await pool.fetchval(
            f"SELECT count(*) FROM relief_tickets {where}", *args
        )
        rows = await pool.fetch(
            f"SELECT {_COLUMNS} FROM relief_tickets {where} "
            f"ORDER BY created_at DESC, id DESC LIMIT ${len(args) + 1} "
            f"OFFSET ${len(args) + 2}",
            *args,
            limit,
            offset,
        )
        return int(total), [_to_ticket(row) for row in rows]

    async def stats(self) -> dict[str, int]:
        """Counts by status and by support type, for the admin view later."""
        pool = self._require_pool()
        by_status = await pool.fetch(
            "SELECT status, count(*)::int AS n FROM relief_tickets GROUP BY status"
        )
        by_urgency = await pool.fetch(
            "SELECT urgency, count(*)::int AS n FROM relief_tickets GROUP BY urgency"
        )
        by_support: dict[str, int] = {}
        rows = await pool.fetch(
            "SELECT support_needed FROM relief_tickets"
        )
        for row in rows:
            for tag in row["support_needed"] or []:
                by_support[tag] = by_support.get(tag, 0) + 1
        return {
            "total": sum(int(r["n"]) for r in by_status),
            "by_status": {r["status"]: int(r["n"]) for r in by_status},
            "by_urgency": {r["urgency"]: int(r["n"]) for r in by_urgency},
            "by_support": by_support,
        }


def _to_ticket(row: asyncpg.Record) -> Ticket:
    return Ticket(
        id=row["id"],
        created_at=_as_utc(row["created_at"]),
        updated_at=_as_utc(row["updated_at"]),
        status=TicketStatus(row["status"]),
        reporter_name=row["reporter_name"],
        reporter_phone=row["reporter_phone"],
        victim_name=row["victim_name"],
        victim_phone=row["victim_phone"],
        summary=row["summary"],
        location=row["location"],
        people_affected=row["people_affected"],
        support_needed=list(row["support_needed"] or []),
        urgency=Urgency(row["urgency"]),
        on_behalf_of_other=row["on_behalf_of_other"],
        notes=row["notes"],
        source=row["source"],
        session_id=row["session_id"],
    )


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
