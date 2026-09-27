"""Collector tests.

The transport is faked, so these tests verify error classification and request
construction without touching the network. Genuine end-to-end calls to the
public APIs live in ``test_live_api.py`` and are opt-in.
"""

from __future__ import annotations

import pytest
import requests

from collectors import flood as flood_collector
from collectors import weather as weather_collector
from collectors.base import (
    DataSourceError,
    FailureReason,
    fetch_json,
)
from tests.conftest import FakeResponse, FakeSession


def no_sleep(_: float) -> None:
    """Replacement for time.sleep so retry tests do not really wait."""


# ---------------------------------------------------------------------------
# success path
# ---------------------------------------------------------------------------


def test_fetch_json_returns_the_decoded_object():
    session = FakeSession(FakeResponse(payload={"daily": {"time": ["2026-09-26"]}}))
    payload = fetch_json(
        "https://example.invalid/x", {"a": 1}, source="test", session=session
    )
    assert payload == {"daily": {"time": ["2026-09-26"]}}
    assert session.calls == [("https://example.invalid/x", {"a": 1})]


# ---------------------------------------------------------------------------
# network-level failures
# ---------------------------------------------------------------------------


class RaisingSession:
    def __init__(self, exception: Exception) -> None:
        self.exception = exception
        self.calls = 0

    def get(self, *_: object, **__: object):
        self.calls += 1
        raise self.exception


def test_timeout_is_classified():
    session = RaisingSession(requests.Timeout("read timed out"))
    with pytest.raises(DataSourceError) as info:
        fetch_json(
            "https://example.invalid/x",
            source="test",
            attempts=1,
            session=session,
        )
    assert info.value.reason == FailureReason.TIMEOUT
    assert info.value.source == "test"


def test_connection_failure_is_classified():
    session = RaisingSession(requests.ConnectionError("no route to host"))
    with pytest.raises(DataSourceError) as info:
        fetch_json(
            "https://example.invalid/x", source="test", attempts=1, session=session
        )
    assert info.value.reason == FailureReason.NETWORK_UNREACHABLE
    assert "no route to host" in (info.value.detail or "")


def test_dns_failure_is_classified_as_network_unreachable():
    session = RaisingSession(requests.exceptions.ConnectionError("getaddrinfo failed"))
    with pytest.raises(DataSourceError) as info:
        fetch_json(
            "https://example.invalid/x", source="test", attempts=1, session=session
        )
    assert info.value.reason == FailureReason.NETWORK_UNREACHABLE


def test_the_session_guard_blocks_outbound_connections():
    """The default suite is hermetic by construction, not by convention.

    Regression test for an audit finding: a test in this suite was calling the
    real USGS feed, so the default run needed internet. ``conftest`` now blocks
    every non-loopback socket for non-``live`` tests, and this test proves the
    block is actually in force. If it ever silently stops working, this fails.
    """
    import socket

    from tests.conftest import OutboundNetworkBlocked

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        with pytest.raises(OutboundNetworkBlocked):
            sock.connect(("93.184.216.34", 80))  # example.com, never contacted
    finally:
        sock.close()


def test_the_session_guard_allows_loopback():
    """The in-process ASGI test client must keep working under the guard."""
    import socket

    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(("127.0.0.1", 0))
    listener.listen(1)
    port = listener.getsockname()[1]
    client_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        client_sock.connect(("127.0.0.1", port))  # must not raise
    finally:
        client_sock.close()
        listener.close()


# ---------------------------------------------------------------------------
# HTTP-level failures
# ---------------------------------------------------------------------------


def test_client_error_is_invalid_request_and_carries_the_upstream_reason():
    """Verified upstream shape: {"reason": ..., "error": true}."""
    body = {"reason": "Latitude must be in range of -90 to 90. Given: 999.0.",
            "error": True}
    session = FakeSession(FakeResponse(status_code=400, payload=body))
    with pytest.raises(DataSourceError) as info:
        fetch_json(
            "https://example.invalid/x",
            source="open-meteo-flood",
            attempts=2,
            session=session,
            sleep=no_sleep,
        )
    assert info.value.reason == FailureReason.INVALID_REQUEST
    assert "Latitude must be in range" in (info.value.detail or "")


def test_client_error_is_not_retried():
    session = FakeSession(FakeResponse(status_code=404, payload={}))
    with pytest.raises(DataSourceError):
        fetch_json(
            "https://example.invalid/x",
            source="test",
            attempts=3,
            session=session,
            sleep=no_sleep,
        )
    assert len(session.calls) == 1


def test_server_error_is_retried_then_raised():
    session = FakeSession(FakeResponse(status_code=503, payload={}))
    with pytest.raises(DataSourceError) as info:
        fetch_json(
            "https://example.invalid/x",
            source="test",
            attempts=2,
            session=session,
            sleep=no_sleep,
        )
    assert info.value.reason == FailureReason.HTTP_ERROR
    assert "HTTP 503" in (info.value.detail or "")
    assert len(session.calls) == 2


# ---------------------------------------------------------------------------
# payload-level failures
# ---------------------------------------------------------------------------


def test_non_json_body_is_malformed():
    session = FakeSession(FakeResponse(text="<html>gateway error</html>", json_error=True))
    with pytest.raises(DataSourceError) as info:
        fetch_json(
            "https://example.invalid/x",
            source="test",
            attempts=1,
            session=session,
        )
    assert info.value.reason == FailureReason.MALFORMED_JSON


def test_json_array_instead_of_object_is_unexpected():
    session = FakeSession(FakeResponse(payload=[1, 2, 3]))
    with pytest.raises(DataSourceError) as info:
        fetch_json(
            "https://example.invalid/x",
            source="test",
            attempts=1,
            session=session,
        )
    assert info.value.reason == FailureReason.UNEXPECTED_PAYLOAD
    assert "list" in (info.value.detail or "")


def test_error_serialises_for_the_output_contract():
    error = DataSourceError("open-meteo-weather", FailureReason.TIMEOUT, "slow")
    assert error.as_dict() == {
        "source": "open-meteo-weather",
        "reason": "timeout",
        "detail": "slow",
    }
    assert "open-meteo-weather" in str(error)


def test_zero_attempts_is_a_programming_error():
    with pytest.raises(ValueError, match="attempts must be"):
        fetch_json("https://example.invalid", source="test", attempts=0)


# ---------------------------------------------------------------------------
# retry behaviour
# ---------------------------------------------------------------------------


def test_transient_failure_then_success():
    class Flaky:
        def __init__(self) -> None:
            self.calls = 0

        def get(self, *_: object, **__: object):
            self.calls += 1
            if self.calls == 1:
                raise requests.ConnectionError("temporary")
            return FakeResponse(payload={"ok": True})

    session = Flaky()
    payload = fetch_json(
        "https://example.invalid/x",
        source="test",
        attempts=2,
        session=session,
        sleep=no_sleep,
    )
    assert payload == {"ok": True}
    assert session.calls == 2


# ---------------------------------------------------------------------------
# request construction
# ---------------------------------------------------------------------------


def test_weather_request_uses_verified_parameters():
    params = weather_collector.build_params(27.7172, 85.324)
    assert params["latitude"] == 27.7172
    assert params["timezone"] == "UTC"
    assert params["past_days"] == 7
    assert set(params["hourly"].split(",")) == {
        "precipitation",
        "rain",
        "precipitation_probability",
    }
    assert set(params["daily"].split(",")) == {
        "precipitation_sum",
        "rain_sum",
        "precipitation_hours",
    }


def test_flood_request_uses_verified_parameters():
    params = flood_collector.build_params(27.7172, 85.324)
    assert params["timezone"] == "UTC"
    assert set(params["daily"].split(",")) == {
        "river_discharge",
        "river_discharge_mean",
        "river_discharge_max",
    }


@pytest.mark.parametrize("latitude", [91.0, -91.0, 999.0])
def test_out_of_range_latitude_is_rejected_before_any_request(latitude):
    session = FakeSession(FakeResponse(payload={}))
    with pytest.raises(DataSourceError) as info:
        weather_collector.get_weather(latitude, 85.0, session=session)
    assert info.value.reason == FailureReason.INVALID_REQUEST
    assert session.calls == []


@pytest.mark.parametrize("longitude", [181.0, -181.0])
def test_out_of_range_longitude_is_rejected_before_any_request(longitude):
    with pytest.raises(DataSourceError) as info:
        flood_collector.get_flood(27.0, longitude)
    assert info.value.reason == FailureReason.INVALID_REQUEST


def test_collectors_hit_the_documented_endpoints():
    assert weather_collector.BASE_URL == "https://api.open-meteo.com/v1/forecast"
    assert flood_collector.BASE_URL == "https://flood-api.open-meteo.com/v1/flood"
    assert weather_collector.SOURCE_NAME == "open-meteo-weather"
    assert flood_collector.SOURCE_NAME == "open-meteo-flood-glofas"


def test_collectors_pass_through_the_session():
    session = FakeSession(FakeResponse(payload={"hourly": {}, "daily": {}}))
    assert weather_collector.get_weather(27.0, 85.0, session=session) == {
        "hourly": {},
        "daily": {},
    }
    assert session.calls[0][0] == weather_collector.BASE_URL
