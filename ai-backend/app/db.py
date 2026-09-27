"""
Postgres access for tickets, via `asyncpg`.

Design notes:

  - The schema is created on startup with idempotent DDL. There is no migration
    tool in this project; adding one is the obvious next step before this holds
    anything real.
  - `support_needed` is a `text[]` rather than a join table, and now that
    `/admin` filters the queue by it, `&&` overlaps it against the admin's
    selection. Four fixed classes, always read whole, one element lookup
    against a GIN index — still less ceremony than a join table, which would
    have meant a second table and a join on the query an admin screen runs on
    every load.
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
    SupportType,
    Ticket,
    TicketCreate,
    TicketMessage,
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
    session_id          text,
    owner_email         text
);

-- Added after the first release, so the ALTER is the path for databases that
-- already have the table. `IF NOT EXISTS` keeps this re-runnable alongside the
-- CREATE above, which is the only reason the startup DDL is tolerable at all.
ALTER TABLE relief_tickets ADD COLUMN IF NOT EXISTS owner_email text;

-- The follow-up conversation. Separate table rather than a column on the
-- ticket: it is append-only, unbounded, and read by a different path, and
-- keeping it out of `relief_tickets` means the reporter-facing read never has
-- to select it.
CREATE TABLE IF NOT EXISTS ticket_messages (
    id                  bigserial          PRIMARY KEY,
    ticket_id           text               NOT NULL REFERENCES relief_tickets (id) ON DELETE CASCADE,
    role                text               NOT NULL,
    text                text               NOT NULL,
    created_at          timestamptz        NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relief_tickets_created_at_idx
    ON relief_tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS relief_tickets_status_idx
    ON relief_tickets (status);
-- GIN, because the admin queue overlaps `support_needed` against the responder's
-- selected support types with `&&`. That was the reason the array had no index
-- at all; a btree cannot help a `text[]` membership test.
CREATE INDEX IF NOT EXISTS relief_tickets_support_idx
    ON relief_tickets USING GIN (support_needed);
CREATE INDEX IF NOT EXISTS relief_tickets_session_idx
    ON relief_tickets (session_id)
    WHERE session_id IS NOT NULL;

-- Partial: only owned tickets are ever looked up this way, and "my tickets"
-- is the hot path for a signed-in reporter.
CREATE INDEX IF NOT EXISTS relief_tickets_owner_idx
    ON relief_tickets (owner_email, created_at DESC)
    WHERE owner_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx
    ON ticket_messages (ticket_id, id);
"""

_COLUMNS = """
    id, created_at, updated_at, status, reporter_name, reporter_phone,
    victim_name, victim_phone, summary, location, people_affected,
    support_needed, urgency, on_behalf_of_other, notes, source, session_id,
    owner_email
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
                        source, session_id, owner_email
                    )
                    VALUES (
                        'TKT-' || lpad(nextval('relief_ticket_seq')::text, 6, '0'),
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
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
                    _clean_email(payload.owner_email),
                )
        return _to_ticket(row)

    async def update_status(self, ticket_id: str, status: TicketStatus) -> Ticket | None:
        """
        Admin-side transition, the only thing in the system that moves a status.

        The reporter-facing assistant cannot call this and does not try: the
        follow-up service echoes the row rather than writing to it, so a model
        reply can never promote a ticket. The only writer is a person on
        `/admin`, through `app/api/ai/admin/tickets/[id]/route.ts`.
        """
        pool = self._require_pool()
        row = await pool.fetchrow(
            f"UPDATE relief_tickets SET status = $2, updated_at = now() "
            f"WHERE id = $1 RETURNING {_COLUMNS}",
            ticket_id,
            status.value,
        )
        return _to_ticket(row) if row else None

    async def claim(
        self, ticket_id: str, owner_email: str, reporter_phone: str
    ) -> Ticket | None:
        """
        Attach an orphaned ticket to an account, proving it with the phone number.

        **The two conditions in the `WHERE` clause are the entire security model,
        and they belong here rather than in Python.** A read-then-write would look
        equivalent and would not be:

        - `owner_email IS NULL` means only a ticket that belongs to nobody can be
          claimed. Any owned ticket is off limits, so this can never be used to
          take someone else's ticket away from them. It also makes a second claim
          of the same row a no-op instead of an overwrite, which is the whole
          point of doing it in one statement — two people racing for the same
          orphan would otherwise both read `NULL` and the second write would win.
        - `reporter_phone = $3` is the second factor. The reference is sequential
          and therefore guessable; the phone number is the part the caller had to
          already know, because they typed it into the ticket.

        Zero rows returned means every one of those failed, and the caller turns
        that into a single indistinguishable 404 — a wrong phone must not be
        distinguishable from a wrong reference.
        """
        pool = self._require_pool()
        row = await pool.fetchrow(
            f"UPDATE relief_tickets SET owner_email = $1, updated_at = now() "
            f"WHERE id = $2 AND owner_email IS NULL AND reporter_phone = $3 "
            f"RETURNING {_COLUMNS}",
            owner_email,
            ticket_id,
            reporter_phone,
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
        support: list[SupportType] | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[int, list[Ticket]]:
        """
        Returns `(total, page)`. `total` ignores limit/offset, so it stays the
        count of everything that matched — which is what lets `/admin` say
        "showing 100 of 143" instead of implying it showed all 143.

        Filters are composed as a clause list rather than interpolated one at a
        time, because `LIMIT`/`OFFSET` are numbered positionally after whatever
        the filters bound. Growing this by appending to `where` is what produces
        a `$2` that silently collides with a bound argument, and asyncpg reports
        a wrong type there rather than a missing row.
        """
        pool = self._require_pool()
        clauses: list[str] = []
        args: list[object] = []

        if status:
            args.append(status.value)
            clauses.append(f"status = ${len(args)}")

        if support:
            # `&&` is array overlap, so a ticket needing medical *and* rescue
            # matches either selection, and selecting both shows the union. The
            # explicit cast is because asyncpg cannot infer the type of a bare
            # array parameter in a `&&` comparison; `::text[]` says it outright.
            args.append([s.value for s in support])
            clauses.append(f"support_needed && ${len(args)}::text[]")

        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

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

    async def list_for_owner(
        self, owner_email: str, *, limit: int = 50, offset: int = 0
    ) -> tuple[int, list[Ticket]]:
        """
        Tickets filed under one account, newest first.

        Scoped by exact match on the normalised address. This is the query behind
        "my tickets", and it is the only reason `owner_email` is indexed at all.
        """
        pool = self._require_pool()
        email = _clean_email(owner_email)
        total = await pool.fetchval(
            "SELECT count(*) FROM relief_tickets WHERE owner_email = $1", email
        )
        rows = await pool.fetch(
            f"SELECT {_COLUMNS} FROM relief_tickets WHERE owner_email = $1 "
            f"ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3",
            email,
            limit,
            offset,
        )
        return int(total), [_to_ticket(row) for row in rows]

    # ---- follow-up messages ------------------------------------------- #

    async def add_message(
        self, ticket_id: str, role: str, text: str
    ) -> TicketMessage:
        """
        Append one turn of follow-up conversation.

        The user's turn is written *before* the model is called. If Gemini then
        fails, the reporter's question is still on the record and still visible
        to an operator — losing their words because our model call failed is the
        one outcome worth spending an extra insert on.
        """
        pool = self._require_pool()
        row = await pool.fetchrow(
            """
            INSERT INTO ticket_messages (ticket_id, role, text)
            VALUES ($1, $2, $3)
            RETURNING id, ticket_id, role, text, created_at
            """,
            ticket_id,
            role,
            text.strip(),
        )
        return _to_message(row)

    async def messages(
        self, ticket_id: str, *, limit: int = 200
    ) -> list[TicketMessage]:
        """
        The follow-up conversation, oldest first.

        Bounded and deliberately so. A reporter and an operator do not generate
        thousands of turns, and this holds the kind of content that should not
        grow without bound in a disaster-response system.
        """
        pool = self._require_pool()
        rows = await pool.fetch(
            """
            SELECT id, ticket_id, role, text, created_at
            FROM (
                SELECT id, ticket_id, role, text, created_at
                FROM ticket_messages
                WHERE ticket_id = $1
                ORDER BY id DESC
                LIMIT $2
            ) recent
            ORDER BY id ASC
            """,
            ticket_id,
            limit,
        )
        return [_to_message(row) for row in rows]

    async def stats(self) -> dict[str, int]:
        """Counts by status and by support type, for the admin view."""
        pool = self._require_pool()
        by_status = await pool.fetch(
            "SELECT status, count(*)::int AS n FROM relief_tickets GROUP BY status"
        )
        by_urgency = await pool.fetch(
            "SELECT urgency, count(*)::int AS n FROM relief_tickets GROUP BY urgency"
        )
        # `unnest` in the database, not a full-table read unnested in Python.
        # `support_needed` is a `text[]`, so a ticket contributes to every class
        # it asked for and the counts legitimately sum to more than the total.
        # Doing this in Python meant selecting every row in the table to count
        # them, which is a table scan whose cost grows with the queue — on the one
        # query an admin screen runs on every load.
        by_support_rows = await pool.fetch(
            "SELECT tag, count(*)::int AS n"
            " FROM relief_tickets, unnest(support_needed) AS tag"
            " GROUP BY tag"
        )
        return {
            "total": sum(int(r["n"]) for r in by_status),
            "by_status": {r["status"]: int(r["n"]) for r in by_status},
            "by_urgency": {r["urgency"]: int(r["n"]) for r in by_urgency},
            "by_support": {r["tag"]: int(r["n"]) for r in by_support_rows},
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
        owner_email=row["owner_email"],
    )


def _to_message(row: asyncpg.Record) -> TicketMessage:
    return TicketMessage(
        id=int(row["id"]),
        ticket_id=row["ticket_id"],
        role=row["role"],
        text=row["text"],
        created_at=_as_utc(row["created_at"]),
    )


def _clean_email(value: str | None) -> str | None:
    """
    Normalise an owner address, or drop it.

    Addresses are compared to decide who may read a ticket, so they are stored
    in exactly one shape. `None` and the empty string mean the same thing here —
    a ticket filed without an account — and both collapse to `NULL` rather than
    to `''`, because `''` would match `''` in a lookup and hand one anonymous
    ticket to another anonymous reporter.
    """
    if not value:
        return None
    cleaned = value.strip().lower()
    return cleaned or None


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
