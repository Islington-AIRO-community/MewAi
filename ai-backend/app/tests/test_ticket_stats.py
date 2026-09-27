"""Tests for `TicketStore.stats`, which the admin view reads."""

import pytest

from app.db import TicketStore
from app.config import Settings


class RecordingPool:
    """A pool that records the SQL it is handed and replies with canned rows.

    The point of these tests is mostly *which query gets sent*, not what the
    numbers come back as, so the recorder is the assertion surface.
    """

    def __init__(self, replies: list[list[dict]]) -> None:
        self.queries: list[str] = []
        self._replies = replies

    async def fetch(self, query: str):
        self.queries.append(query)
        if not self._replies:
            return []
        return self._replies.pop(0)


def make_store(pool) -> TicketStore:
    store = TicketStore(Settings())
    store._pool = pool
    return store


async def test_support_counts_are_grouped_in_the_database():
    """`support_needed` is a `text[]`, and it used to be unnested in Python.

    The old implementation ran `SELECT support_needed FROM relief_tickets` and
    counted the arrays in a loop — a full table scan, on the one query an admin
    screen runs on every load, whose cost grows with the queue it exists to
    summarise. The array has to be expanded where the rows are counted.
    """
    pool = RecordingPool(
        [
            [{"status": "submitted", "n": 2}],
            [{"urgency": "critical", "n": 1}],
            [{"tag": "medical", "n": 2}, {"tag": "rescue", "n": 1}],
        ]
    )

    await make_store(pool).stats()

    joined = "\n".join(pool.queries)
    assert "unnest(support_needed)" in joined
    # The whole-table read is what has to go away, so assert its absence too:
    # a future edit that reintroduces it would still pass the assertion above.
    assert "SELECT support_needed FROM" not in joined
    assert all("GROUP BY" in q for q in pool.queries if "support_needed" in q)


async def test_stats_shape_survives_the_rewrite():
    pool = RecordingPool(
        [
            [{"status": "submitted", "n": 2}, {"status": "resolved", "n": 1}],
            [{"urgency": "critical", "n": 1}],
            [{"tag": "medical", "n": 2}, {"tag": "rescue", "n": 1}],
        ]
    )

    result = await make_store(pool).stats()

    assert result == {
        "total": 3,
        "by_status": {"submitted": 2, "resolved": 1},
        "by_urgency": {"critical": 1},
        "by_support": {"medical": 2, "rescue": 1},
    }


async def test_one_ticket_can_count_in_several_support_classes():
    """Pinned because it looks like a bug and is not.

    A ticket that needs food, water and medical help is one ticket in the table
    and three rows after `unnest`, so `by_support` legitimately sums to more
    than `total`. The admin view says so in words; this test is why it can.
    """
    pool = RecordingPool(
        [
            [{"status": "submitted", "n": 1}],
            [{"urgency": "high", "n": 1}],
            [
                {"tag": "medical", "n": 1},
                {"tag": "rescue", "n": 1},
                {"tag": "relief-supplies", "n": 1},
            ],
        ]
    )

    result = await make_store(pool).stats()

    assert result["total"] == 1
    assert sum(result["by_support"].values()) == 3


async def test_an_empty_table_is_all_zeros_rather_than_missing_keys():
    pool = RecordingPool([[], [], []])

    result = await make_store(pool).stats()

    assert result == {
        "total": 0,
        "by_status": {},
        "by_urgency": {},
        "by_support": {},
    }


async def test_stats_still_raises_before_connect():
    """The database gate is the same as every other ticket path.

    Without it the admin view would render "0 filed" during a database blip,
    which is the one number nobody should ever have to guess at.
    """
    store = TicketStore(Settings())
    with pytest.raises(RuntimeError):
        await store.stats()
