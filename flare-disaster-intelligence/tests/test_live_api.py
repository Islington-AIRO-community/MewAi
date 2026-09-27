"""LIVE API INTEGRATION TESTS - opt-in, and clearly separate from unit tests.

These tests make real HTTPS calls to the public Open-Meteo and USGS endpoints.
They are **skipped by default** so that ``pytest`` stays fast, hermetic and
offline-safe: nothing in the default suite opens a network connection.

To run them::

    FLARE_LIVE_TESTS=1 python -m pytest tests/test_live_api.py -v

On Windows PowerShell::

    $env:FLARE_LIVE_TESTS="1"; python -m pytest tests/test_live_api.py -v

WHAT IS AND IS NOT VERIFIED HERE
--------------------------------
These tests verify that the endpoints are reachable from this machine, that the
parameters the collectors send are accepted, and that the pipeline completes
against real data. They do **not** verify the scientific validity of the risk
score, because the risk engine is a rule-based prototype with no validated
thresholds.

Every test here can legitimately FAIL for reasons that have nothing to do with
the code (no network, captive portal, upstream outage, rate limiting). A failure
means "could not verify", never "the pipeline is broken".
"""

from __future__ import annotations

import os

import pytest

from collectors.base import DataSourceError, FailureReason
from collectors.earthquake import extract_significant_events, get_recent_earthquakes
from collectors.flood import get_flood
from collectors.weather import get_weather
from pipeline import run_flood_pipeline
from risk.earthquake import assess_earthquake
from schemas.events import Location

pytestmark = pytest.mark.live

LIVE_ENV_VAR = "FLARE_LIVE_TESTS"
LONG_TIMEOUT = 45.0

#: A real coordinate in the Kathmandu valley.
KATHMANDU = Location(name="Kathmandu", latitude=27.7172, longitude=85.3240)

#: A second real coordinate, used to check the pipeline is not tuned to one point.
BIRATNAGAR = Location(name="Biratnagar", latitude=26.4525, longitude=87.2718)

live_required = pytest.mark.skipif(
    os.environ.get(LIVE_ENV_VAR, "").strip() not in {"1", "true", "yes"},
    reason=(
        f"Live API tests are opt-in. Set {LIVE_ENV_VAR}=1 to run them. "
        "They make real network calls."
    ),
)


# ---------------------------------------------------------------------------
# collector reachability
# ---------------------------------------------------------------------------


@live_required
def test_weather_endpoint_is_reachable_and_shaped_as_expected():
    payload = get_weather(KATHMANDU.latitude, KATHMANDU.longitude, timeout=LONG_TIMEOUT)
    assert "hourly" in payload
    assert "daily" in payload
    assert payload["hourly"]["time"], "no hourly time axis returned"
    assert "precipitation" in payload["hourly"]
    # past_days=7 + forecast_days=7 = 14 days of hourly data = 336 steps
    assert len(payload["hourly"]["time"]) == 336
    assert payload.get("utc_offset_seconds") == 0


@live_required
def test_flood_endpoint_is_reachable_and_shaped_as_expected():
    payload = get_flood(KATHMANDU.latitude, KATHMANDU.longitude, timeout=LONG_TIMEOUT)
    assert "daily" in payload
    daily = payload["daily"]
    assert daily["time"], "no daily time axis returned"
    for field in ("river_discharge", "river_discharge_mean", "river_discharge_max"):
        assert field in daily, f"missing requested field: {field}"
    # past_days=7 + forecast_days=3 = 10 daily steps
    assert len(daily["time"]) == 10
    # All requested series must be the same length as the time axis.
    assert len(daily["river_discharge"]) == len(daily["time"])


@live_required
def test_flood_api_does_not_offer_hourly_discharge():
    """Documents a verified upstream limitation rather than working around it.

    The flood API rejects ``hourly=river_discharge`` with HTTP 400, so this
    pipeline uses daily discharge only. If a future Open-Meteo release adds
    hourly discharge, this test is the signal to revisit that decision.
    """
    from collectors.base import fetch_json
    from collectors.flood import BASE_URL, SOURCE_NAME

    with pytest.raises(DataSourceError) as info:
        fetch_json(
            BASE_URL,
            {
                "latitude": KATHMANDU.latitude,
                "longitude": KATHMANDU.longitude,
                "hourly": "river_discharge",
                "forecast_days": 1,
                "timezone": "UTC",
            },
            source=SOURCE_NAME,
            timeout=LONG_TIMEOUT,
            attempts=1,
        )
    assert info.value.reason == FailureReason.INVALID_REQUEST


@live_required
def test_invalid_coordinate_is_rejected_by_the_upstream_api():
    """Confirms the error-handling path against a real 400 response."""
    from collectors.base import fetch_json
    from collectors.weather import BASE_URL, SOURCE_NAME

    with pytest.raises(DataSourceError) as info:
        fetch_json(
            BASE_URL,
            {"latitude": 999.0, "longitude": 85.0, "hourly": "precipitation"},
            source=SOURCE_NAME,
            timeout=LONG_TIMEOUT,
            attempts=1,
        )
    assert info.value.reason == FailureReason.INVALID_REQUEST
    assert "90" in (info.value.detail or "")


@live_required
def test_unreachable_host_is_classified_as_a_network_failure():
    """Uses a reserved-for-documentation TLD that cannot resolve."""
    from collectors.base import fetch_json

    with pytest.raises(DataSourceError) as info:
        fetch_json(
            "https://api.this-host-does-not-exist.invalid/v1/forecast",
            source="test",
            timeout=10.0,
            attempts=1,
        )
    assert info.value.reason in {
        FailureReason.NETWORK_UNREACHABLE,
        FailureReason.TIMEOUT,
    }


# ---------------------------------------------------------------------------
# full pipeline against live data
# ---------------------------------------------------------------------------


@live_required
def test_pipeline_completes_against_live_data():
    event = run_flood_pipeline(KATHMANDU, timeout=LONG_TIMEOUT)
    assert event.disaster_type == "flood"
    assert event.data_quality.origin in {"live_api", "partial"}
    assert event.assessment.threat_level in {
        "LOW",
        "MODERATE",
        "HIGH",
        "CRITICAL",
        "UNKNOWN",
    }
    if event.risk_score is not None:
        assert 0.0 <= event.risk_score <= 1.0
    # A live run must never claim to be synthetic.
    assert event.data_quality.is_synthetic is False


@live_required
def test_live_run_produces_real_measurements():
    event = run_flood_pipeline(KATHMANDU, timeout=LONG_TIMEOUT)
    measurements = event.evidence["measurements"]
    assert event.data_quality.origin == "live_api", (
        f"expected a clean live run, got: {event.data_quality.warnings}"
    )
    assert event.data_quality.coverage == 1.0
    assert measurements["discharge_observed_days"] is not None
    assert measurements["discharge_baseline_m3s"] is not None


@live_required
def test_live_run_reports_the_model_grid_offset():
    """Open-Meteo snaps requests to a grid cell; the offset must be disclosed."""
    event = run_flood_pipeline(KATHMANDU, timeout=LONG_TIMEOUT)
    grid = event.evidence["model_grid"]["weather"]
    if grid:
        assert grid["latitude"] != pytest.approx(KATHMANDU.latitude, abs=1e-6) or (
            grid["longitude"] != pytest.approx(KATHMANDU.longitude, abs=1e-6)
        )


@live_required
def test_pipeline_works_at_a_second_nepal_location():
    event = run_flood_pipeline(BIRATNAGAR, timeout=LONG_TIMEOUT)
    assert event.data_quality.origin in {"live_api", "partial"}
    assert event.message


@live_required
def test_method_metadata_declares_the_prototype_status_in_live_output():
    event = run_flood_pipeline(KATHMANDU, timeout=LONG_TIMEOUT)
    assert event.evidence["is_machine_learning"] is False
    assert "PROTOTYPE ASSUMPTIONS" in event.evidence["calibration_status"]


@live_required
def test_usgs_earthquake_feed_is_live():
    """The retained earthquake path still reaches the real USGS feed.

    This was previously asserted in ``tests/test_api.py``, which made the default
    suite depend on the network. It lives here so ``pytest`` alone stays offline.
    The offline suite covers the route with a mocked feed.
    """
    feed = get_recent_earthquakes()
    assert isinstance(feed.get("features"), list)
    assert feed["features"], "USGS all_day feed returned no events"
    significant = extract_significant_events(feed)
    for event in significant:
        assert event["magnitude"] >= 4.5
        assert isinstance(event["depth_km"], (int, float))
        assert event["depth_km"] is not None


@live_required
def test_earthquake_assessment_completes_against_live_events():
    result = assess_earthquake(
        extract_significant_events(get_recent_earthquakes()),
        KATHMANDU.latitude,
        KATHMANDU.longitude,
    )
    assert 0.0 <= result["risk_score"] <= 1.0
    assert result["threat_level"] in {"LOW", "MODERATE", "HIGH", "CRITICAL"}
