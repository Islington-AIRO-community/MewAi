"""Defensive helpers for turning messy API payloads into usable numbers.

The upstream APIs occasionally return ``null`` for a value, a string where a
number was expected, or a series shorter than its own time axis. These helpers
make that failure mode explicit and countable instead of letting it turn into a
``TypeError`` deep inside the risk engine.

Nothing here invents or imputes a value. A value that cannot be read becomes
``None`` and is counted, and the caller decides how to degrade.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Iterable, Sequence

#: Sentinel returned by :func:`coerce_float` callers can test for.
NONE = None


def coerce_float(value: Any) -> float | None:
    """Return ``value`` as a finite ``float``, or ``None`` if that is impossible.

    Rejects ``None``, booleans, ``NaN``, ``+/-inf``, non-numeric strings and
    containers. Numeric strings such as ``"12.5"`` are accepted because the
    Open-Meteo APIs are documented to be able to return them.
    """
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            number = float(text)
        except ValueError:
            return None
    else:
        return None
    if not math.isfinite(number):
        return None
    return number


def coerce_float_list(values: Any) -> tuple[list[float | None], int]:
    """Coerce a series element-wise, preserving positions and ``None`` holes.

    Returns the coerced list plus the number of entries that had to be discarded
    as unreadable. Positional alignment with the time axis is preserved so that
    ``series[i]`` still corresponds to ``time[i]``.
    """
    if not isinstance(values, (list, tuple)):
        return [], 0
    coerced: list[float | None] = []
    dropped = 0
    for item in values:
        number = coerce_float(item)
        if number is None and item is not None:
            dropped += 1
        coerced.append(number)
    return coerced, dropped


def truncate_to_shortest(
    time_values: Sequence[Any] | None, *series: Sequence[Any]
) -> tuple[list[Any], list[list[Any]]]:
    """Truncate every series to the length of the shortest one.

    A time axis longer than its data (or vice versa) is a malformed response.
    Truncating to the shortest keeps positional alignment valid; the caller
    records a warning so the condition is visible in the output.
    """
    lengths = [len(time_values or [])] + [len(s) for s in series]
    shortest = min(lengths) if lengths else 0
    time_list = list(time_values or [])[:shortest]
    truncated = [list(s)[:shortest] for s in series]
    return time_list, truncated


def parse_api_timestamp(value: Any) -> datetime | None:
    """Parse an Open-Meteo ISO-8601 timestamp into an aware UTC ``datetime``.

    Handles both the hourly form ``2026-09-26T00:00`` and the daily form
    ``2026-09-26``. Naive timestamps are interpreted as UTC because the
    collector always requests ``timezone=UTC``.
    """
    if not isinstance(value, str):
        return None
    text = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def utc_now() -> datetime:
    """Current time as an aware UTC ``datetime``. Injectable via parameters."""
    return datetime.now(timezone.utc)


def mean_or_none(values: Iterable[float | None]) -> float | None:
    """Arithmetic mean ignoring ``None``; ``None`` if no usable values."""
    usable = [v for v in values if v is not None]
    if not usable:
        return None
    return sum(usable) / len(usable)


def max_or_none(values: Iterable[float | None]) -> float | None:
    """Maximum ignoring ``None``; ``None`` if no usable values."""
    usable = [v for v in values if v is not None]
    if not usable:
        return None
    return max(usable)


def sum_or_none(values: Iterable[float | None]) -> float | None:
    """Sum ignoring ``None``; ``None`` if every entry was unusable.

    An empty window and a window of all-``None`` are deliberately treated the
    same way, because neither supports a risk statement.
    """
    usable = [v for v in values if v is not None]
    if not usable:
        return None
    return float(sum(usable))
