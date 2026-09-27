"""
Tests for the filters on the admin queue — `GET /api/tickets?status=…&support=…`.

`/admin` is the only place a responder narrows the queue, and a filter that
silently does nothing is the failure that matters here: the control renders, the
request returns 200, and the list comes back whole. A responder reading "medical
requests" and getting all of them concludes the database is lying about the
ticket's own `support_needed`, which is worse than having no filter at all.

So these assert *which SQL gets sent* rather than what comes back. The filters are
composed as a numbered clause list, and `LIMIT`/`OFFSET` are positioned after
whatever the filters bound — a numbering mistake there binds a page size to the
status column and returns the wrong rows with no error anywhere.

No database and no model calls.

    .venv/bin/python -m pytest app/tests -q
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import Settings
from app.db import TicketStore
from app.routers.tickets import router as tickets_router
from app.schemas import SupportType, TicketStatus


class RecordingListPool:
    """Records the SQL *and* the bound arguments for every query.

    Both matter. The query text alone would pass a test where the arguments are
    in the wrong order, and the arguments alone would pass one where the
    placeholders drifted out of step with them.
    """

    def __init__(self, count: int = 0) -> None:
        self.queries: list[tuple[str, tuple[object, ...]]] = []
        self._count = count

    async def fetchval(self, query: str, *args: object):
        self.queries.append((query, args))
        return self._count

    async def fetch(self, query: str, *args: object):
        self.queries.append((query, args))
        return []

    def page_query(self) -> tuple[str, tuple[object, ...]]:
        """The row query, as opposed to the `count(*)` that runs first."""
        return self.queries[-1]


def make_store(pool) -> TicketStore:
    store = TicketStore(Settings())
    store._pool = pool
    return store


async def test_a_support_filter_becomes_an_array_overlap():
    """`&&`, not `=`.

    `support_needed` is a `text[]` and a ticket can need medical *and* rescue, so
    an equality test would silently drop every multi-need ticket from exactly the
    filtered view a responder opens to find them. Overlap is what "needs any of
    these" means.
    """
    pool = RecordingListPool()

    await make_store(pool).list(support=[SupportType.MEDICAL])

    query, args = pool.page_query()
    assert "support_needed && $1" in query
    assert args[0] == ["medical"]


async def test_several_support_types_are_one_overlap_not_several_clauses():
    """Selecting medical and rescue is the union, in a single predicate.

    Written as two `&&` clauses this would be an intersection — only tickets
    needing *both* would survive, which is the opposite of what the chips say.
    """
    pool = RecordingListPool()

    await make_store(pool).list(
        support=[SupportType.MEDICAL, SupportType.RESCUE],
    )

    query, args = pool.page_query()
    assert query.count("support_needed &&") == 1
    assert " AND " not in query.split("ORDER BY")[0]
    assert args[0] == ["medical", "rescue"]
    # limit/offset are still numbered after the one bound argument.
    assert "LIMIT $2" in query and "OFFSET $3" in query


async def test_status_and_support_share_one_where_and_stay_numbered():
    """The load-bearing test.

    Both filters bind arguments, and `LIMIT`/`OFFSET` are numbered after all of
    them. Growing this query by appending to a single `where` string is exactly
    how a `$2` ends up bound to a text column — which Postgres reports as a type
    error at best, and which reads as "the filter broke" rather than "the SQL is
    wrong" at worst.
    """
    pool = RecordingListPool()

    await make_store(pool).list(
        status=TicketStatus.SUBMITTED,
        support=[SupportType.MEDICAL],
        limit=25,
        offset=50,
    )

    count_query, count_args = pool.queries[0]
    query, args = pool.page_query()

    for text in (count_query, query):
        assert "status = $1" in text
        assert "&& $2" in text
        assert " AND " in text

    # The count ignores paging, so it carries no LIMIT at all.
    assert "LIMIT" not in count_query
    assert count_args == ("submitted", ["medical"])

    assert "LIMIT $3 OFFSET $4" in query
    assert args == ("submitted", ["medical"], 25, 50)


async def test_no_filters_emits_no_where_at_all():
    """A stray `WHERE` with nothing after it is a syntax error.

    Cheap to assert and it is the shape a refactor away: building the clause
    list and joining it unconditionally is a one-line mistake.
    """
    pool = RecordingListPool(count=3)

    total, page = await make_store(pool).list()

    assert "WHERE" not in pool.page_query()[0]
    assert (total, page) == (3, [])


async def test_an_empty_support_list_is_no_filter():
    """Selecting no chip must not filter for tickets needing nothing.

    `[]` reaches here from the client when the responder deselects the last one.
    `&& '{}'` would match zero rows and the queue would look empty — with the
    data still there.
    """
    pool = RecordingListPool()

    await make_store(pool).list(support=[])

    query, args = pool.page_query()
    # `support_needed` is in the SELECT list via `_COLUMNS`, so this has to
    # assert on the predicate rather than the column name.
    assert "&&" not in query
    assert "WHERE" not in query
    assert args == (50, 0)


async def test_total_counts_everything_that_matched_not_the_page():
    """`total` is what lets `/admin` say "showing 100 of 143".

    The proxy caps the queue at 100 rows, so without the untruncated count a
    responder with 143 submitted tickets sees a list of 100 and no way to tell
    that 43 exist.
    """
    pool = RecordingListPool(count=143)

    total, _ = await make_store(pool).list(
        support=[SupportType.RESCUE],
        limit=100,
    )

    assert total == 143
    # The count query carries the filter but never the page size.
    assert "support_needed && $1" in pool.queries[0][0]
    assert "LIMIT" not in pool.queries[0][0]


def _client(store) -> TestClient:
    """A client for the real router, with only the database swapped out."""
    app = FastAPI()
    app.include_router(tickets_router)
    app.state.tickets = store
    return TestClient(app)


class ReadyStore:
    """A store that is up, so parameter validation is what answers."""

    ready = True

    async def list(self, **_kwargs: object) -> tuple[int, list]:
        return 0, []


def test_repeated_support_params_become_the_union():
    """The wire shape the browser actually sends.

    The chips are multi-select, so `/admin` emits one `support=` per selected
    type. A single-valued parameter here would keep only the last chip, which
    reads as a filter that sometimes does nothing.
    """
    response = _client(ReadyStore()).get(
        "/tickets?support=medical&support=rescue"
    )

    assert response.status_code == 200
    assert response.json() == {"total": 0, "tickets": []}


def test_an_unknown_support_type_is_rejected():
    """422, and it stays a 422 rather than reaching the database.

    A typo in a support type is a client bug, and letting it through would
    match zero rows — a queue that looks empty because of a misspelling.
    """
    response = _client(ReadyStore()).get("/tickets?support=medival")

    assert response.status_code == 422


def test_a_blank_support_param_is_not_a_filter():
    """`?support=` reads as "no filter", not as "the empty support type".

    The proxy strips empty values before forwarding, so this cannot arrive from
    our own client — but the endpoint is reachable directly from inside the
    service's network, and `?support=` must not mean "tickets needing nothing".
    """
    response = _client(ReadyStore()).get("/tickets?support=")

    # FastAPI has no valid empty member for a SupportType, so this is a 422
    # rather than an empty filter. Pinned because the *alternative* answer —
    # treating it as a filter — would empty the queue.
    assert response.status_code == 422
