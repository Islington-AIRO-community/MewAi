"""Shared pytest fixtures and helpers for the FLARE test-suite.

Hermeticity is enforced, not merely intended. A session guard blocks every
outbound socket connection for the whole run, so a test that accidentally
reaches the public APIs fails loudly instead of silently passing on a
developer machine and failing (or skipping) in CI.

Loopback and AF_UNIX connections are allowed, because the in-process FastAPI
``TestClient`` legitimately uses local sockets for its ASGI portal. Only
connections to a remote host raise.

The guard lifts itself for tests marked ``live``, which is how the opt-in
integration suite in ``test_live_api.py`` is able to call the real endpoints.
"""

from __future__ import annotations

import socket
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest

from processing.validation import coerce_float

# Make the project packages importable regardless of the invocation directory.
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

#: Fixed reference time used by every deterministic test.
NOW = datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc)


class OutboundNetworkBlocked(RuntimeError):
    """Raised when a non-live test tries to open a connection to a remote host."""


_REAL_CONNECT = socket.socket.connect
_REAL_CONNECT_EX = socket.socket.connect_ex
#: Set to True while a ``live``-marked test runs.
_network_allowed = False


def _address_is_local(address: object) -> bool:
    """True for loopback and AF_UNIX addresses, which the ASGI test client uses."""
    if isinstance(address, tuple) and address:
        return str(address[0]) in {"127.0.0.1", "::1", "localhost", "0.0.0.0", ""}
    return True


def _guarded_connect(self, address):
    if not _network_allowed and not _address_is_local(address):
        raise OutboundNetworkBlocked(
            f"the default test suite must not open a network connection (tried {address!r}). "
            "Mark the test with @pytest.mark.live and gate it on FLARE_LIVE_TESTS=1."
        )
    return _REAL_CONNECT(self, address)


def _guarded_connect_ex(self, address):
    if not _network_allowed and not _address_is_local(address):
        raise OutboundNetworkBlocked(
            f"the default test suite must not open a network connection (tried {address!r})."
        )
    return _REAL_CONNECT_EX(self, address)


def pytest_sessionstart(session):
    socket.socket.connect = _guarded_connect
    socket.socket.connect_ex = _guarded_connect_ex


def pytest_sessionfinish(session, exitstatus):
    socket.socket.connect = _REAL_CONNECT
    socket.socket.connect_ex = _REAL_CONNECT_EX


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_protocol(item, nextitem):
    """Lift the network guard for ``live``-marked tests only."""
    global _network_allowed
    _network_allowed = item.get_closest_marker("live") is not None
    try:
        yield
    finally:
        _network_allowed = False


@pytest.fixture
def now() -> datetime:
    """A fixed UTC reference time so time-window maths is deterministic."""
    return NOW


class FakeResponse:
    """Minimal stand-in for ``requests.Response``."""

    def __init__(
        self,
        status_code: int = 200,
        payload: Any = None,
        text: str | None = None,
        json_error: bool = False,
    ) -> None:
        self.status_code = status_code
        self._payload = payload
        self._text = text
        self._json_error = json_error

    def raise_for_status(self) -> None:
        import requests

        if self.status_code >= 400:
            raise requests.HTTPError(f"{self.status_code} Error")

    def json(self) -> Any:
        if self._json_error:
            raise ValueError("Expecting value: line 1 column 1 (char 0)")
        if self._payload is not None:
            return self._payload
        import json as _json

        return _json.loads(self._text or "{}")


class FakeSession:
    """A ``requests.Session`` replacement that replays scripted responses.

    Parameters
    ----------
    responses:
        A single response, or a list consumed one per call. The last entry is
        reused once the list is exhausted.
    """

    def __init__(self, responses: FakeResponse | list[FakeResponse]) -> None:
        self._responses = responses if isinstance(responses, list) else [responses]
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def get(self, url: str, params: dict[str, Any] | None = None, **_: Any):
        self.calls.append((url, params or {}))
        index = min(len(self.calls) - 1, len(self._responses) - 1)
        return self._responses[index]


def hourly_payload(
    values: list[Any],
    *,
    start: datetime = NOW - timedelta(hours=72),
    step_hours: int = 1,
    time_length: int | None = None,
) -> dict[str, Any]:
    """Build an Open-Meteo shaped hourly weather payload.

    ``time_length`` can be set larger than ``values`` to simulate a time axis
    that is longer than its data series.
    """
    count = time_length if time_length is not None else len(values)
    times = [
        (start + timedelta(hours=index * step_hours)).strftime("%Y-%m-%dT%H:%M")
        for index in range(count)
    ]
    return {
        "latitude": 27.7329,
        "longitude": 85.3483,
        "elevation": 1301.0,
        "utc_offset_seconds": 0,
        "timezone": "GMT",
        "hourly": {
            "time": times,
            "precipitation": list(values),
            "rain": list(values),
            "precipitation_probability": [0.0] * len(values),
        },
        "daily": {"time": [], "precipitation_sum": [], "rain_sum": []},
    }


def _scale(values: list[Any], factor: float) -> list[Any]:
    """Multiply numeric entries, passing anything unreadable through unchanged.

    Lets a fixture derive well-formed optional series from a primary series that
    deliberately contains nulls or junk values.
    """
    scaled: list[Any] = []
    for value in values:
        number = coerce_float(value)
        scaled.append(value if number is None else number * factor)
    return scaled


def daily_payload(
    discharges: list[Any],
    *,
    start: datetime = NOW - timedelta(days=7),
    means: list[Any] | None = None,
    maxima: list[Any] | None = None,
    time_length: int | None = None,
    include_max: bool = True,
) -> dict[str, Any]:
    """Build an Open-Meteo shaped daily discharge payload.

    ``start`` defaults to 7 days before ``NOW`` so that index 7 is "today",
    which is how the real endpoint lays out ``past_days=7, forecast_days=3``.

    ``means`` and ``maxima`` default to well-formed aligned series so the
    default fixture represents a healthy response. Pass ``include_max=False``
    or a wrong-length list to exercise the optional-series paths.
    """
    count = time_length if time_length is not None else len(discharges)
    times = [
        (start + timedelta(days=index)).strftime("%Y-%m-%d") for index in range(count)
    ]
    daily: dict[str, Any] = {
        "time": times,
        "river_discharge": list(discharges),
        "river_discharge_mean": (
            list(means) if means is not None else _scale(discharges, 0.5)
        ),
    }
    if include_max:
        daily["river_discharge_max"] = (
            list(maxima) if maxima is not None else _scale(discharges, 2.0)
        )
    return {
        "latitude": 27.725,
        "longitude": 85.325,
        "elevation": 1301.0,
        "utc_offset_seconds": 0,
        "timezone": "GMT",
        "daily_units": {
            "time": "iso8601",
            "river_discharge": "m3/s",
            "river_discharge_mean": "m3/s",
            "river_discharge_max": "m3/s",
        },
        "daily": daily,
    }
