"""HTTP API tests using an in-process client. No network calls are made.

The offline and threshold endpoints are fully deterministic, so they are tested
directly. The live ``/v1/flood`` endpoint is exercised with the synthetic
fallback so that the response *shape* is verified without depending on an
upstream service being up. The earthquake route's USGS feed is mocked for the
same reason; the real feed is covered by the opt-in live suite.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

import api
import main
from schemas.events import CONTRACT_VERSION


def _usgs_feature(
    feature_id: str, *, mag: float, lon: float, lat: float, depth_km: float
) -> dict[str, Any]:
    """One GeoJSON feature in the shape ``extract_significant_events`` reads."""
    return {
        "id": feature_id,
        "properties": {
            "mag": mag,
            "time": 1758000000000,
            "place": "100 km N of Somewhere",
            "alert": "green",
            "url": f"https://example.invalid/{feature_id}",
        },
        "geometry": {"type": "Point", "coordinates": [lon, lat, depth_km]},
    }


def usgs_feed() -> dict[str, Any]:
    """A small synthetic USGS-style feed: two events above the 4.5 threshold."""
    return {
        "type": "FeatureCollection",
        "features": [
            _usgs_feature("major", mag=6.4, lon=85.9, lat=27.4, depth_km=10.0),
            _usgs_feature("moderate", mag=4.8, lon=84.2, lat=28.1, depth_km=15.0),
        ],
    }


@pytest.fixture
def client() -> TestClient:
    return TestClient(api.app)


# ---------------------------------------------------------------------------
# service endpoints
# ---------------------------------------------------------------------------


def test_health_needs_no_network(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["contract_version"] == CONTRACT_VERSION


def test_thresholds_endpoint_publishes_every_assumption(client):
    body = client.get("/v1/thresholds").json()
    assert body["method"]["is_machine_learning"] is False
    assert "PROTOTYPE ASSUMPTIONS" in body["calibration_status"]
    assert "not official" in body["disclaimer"].lower()
    assert len(body["indicators"]) == 4
    assert len(body["threat_levels"]) == 4
    assert body["alert_policy"]["min_coverage_to_alert"] == 1.0


def test_contract_endpoint_returns_a_json_schema(client):
    schema = client.get("/v1/contract").json()
    assert "properties" in schema
    for field in ("event_id", "disaster_type", "location", "risk_score", "assessment"):
        assert field in schema["properties"]


def test_locations_endpoint_lists_demo_locations(client):
    keys = {row["key"] for row in client.get("/v1/locations").json()["locations"]}
    assert {"kathmandu", "pokhara", "biratnagar"} <= keys


def test_scenarios_endpoint_warns_that_they_are_not_live(client):
    body = client.get("/v1/scenarios").json()
    assert "SYNTHETIC" in body["warning"]
    assert set(body["scenarios"]) == {
        "calm",
        "rising",
        "severe",
        "no_discharge_data",
        "malformed",
    }


# ---------------------------------------------------------------------------
# flood endpoints
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("scenario", "threat", "alert"),
    [
        ("calm", "LOW", False),
        ("rising", "MODERATE", False),
        ("severe", "CRITICAL", True),
    ],
)
def test_offline_flood_matches_the_documented_scenario_outcomes(
    client, scenario, threat, alert
):
    body = client.get(f"/v1/flood/offline?scenario={scenario}").json()
    assert body["assessment"]["threat_level"] == threat
    assert body["assessment"]["alert"] is alert
    assert body["data_quality"]["origin"] == "synthetic_demo"
    assert body["data_quality"]["is_synthetic"] is True


def test_offline_partial_data_scenario_is_suppressed_not_alerted(client):
    body = client.get("/v1/flood/offline?scenario=no_discharge_data").json()
    assert body["assessment"]["threat_level"] == "HIGH"
    assert body["assessment"]["alert"] is False
    assert body["assessment"]["suppressed"] is True
    assert body["assessment"]["requires_manual_verification"] is True


def test_offline_malformed_scenario_still_returns_a_contract_object(client):
    body = client.get("/v1/flood/offline?scenario=malformed").json()
    assert body["disaster_type"] == "flood"
    assert body["data_quality"]["warnings"], "malformed data must be reported"
    assert 0.0 <= body["data_quality"]["coverage"] <= 1.0


def test_offline_endpoint_never_claims_live_data(client):
    for scenario in ("calm", "rising", "severe", "no_discharge_data", "malformed"):
        body = client.get(f"/v1/flood/offline?scenario={scenario}").json()
        assert body["data_quality"]["origin"] == "synthetic_demo"
        assert body["data_quality"]["is_synthetic"] is True
        warnings = " ".join(body["data_quality"]["warnings"]).lower()
        assert "offline fixtures" in warnings
        assert "not from a live api call" in warnings
        for source in body["data_quality"]["sources"]:
            assert source["origin"] == "synthetic_demo", (
                "a per-source origin must never contradict the run provenance"
            )


def test_unknown_location_is_a_404_listing_the_valid_ones(client):
    response = client.get("/v1/flood?location=atlantis")
    assert response.status_code == 404
    assert "kathmandu" in response.json()["detail"]


def test_unknown_scenario_is_a_404_listing_the_valid_ones(client):
    response = client.get("/v1/flood/offline?scenario=does-not-exist")
    assert response.status_code == 404
    assert "severe" in response.json()["detail"]


def test_flood_response_carries_no_confidence_field(client):
    body = client.get("/v1/flood/offline?scenario=severe").json()
    assert "confidence" not in body
    assert "confidence" not in body["assessment"]
    assert "confidence" not in body["data_quality"]


def test_flood_response_is_json_serialisable_end_to_end(client):
    import json

    body = client.get("/v1/flood/offline?scenario=severe").json()
    json.dumps(body)
    assert body["event_id"].startswith("flood-")
    assert body["timestamp"]
    assert body["message"]


def test_earthquake_endpoint_is_still_available(client, monkeypatch):
    """The original prototype route is retained and still answers.

    The USGS feed is mocked so the default suite stays offline. The real-feed
    check lives in ``tests/test_live_api.py::test_usgs_earthquake_feed_is_live``.
    """
    monkeypatch.setattr(main, "get_recent_earthquakes", lambda: usgs_feed())
    response = client.get("/demo/earthquake")
    assert response.status_code == 200
    body = response.json()
    assert body["disaster_type"] == "earthquake"
    assert body["threat_level"] in ("LOW", "MODERATE", "HIGH", "CRITICAL")
    assert isinstance(body["risk_score"], float)
    assert body["evidence"]["events_considered"] == 2
    # The prototype scope is stated on the payload itself.
    assert "not Nepal-calibrated" in body["scope_note"]


def test_earthquake_endpoint_filters_events_below_the_magnitude_threshold(
    client, monkeypatch
):
    """The 4.5 magnitude filter is applied before assessment."""
    feed = usgs_feed()
    feed["features"] = [
        *feed["features"],
        _usgs_feature("quiet", mag=2.1, lon=85.0, lat=27.7, depth_km=5.0),
    ]
    monkeypatch.setattr(main, "get_recent_earthquakes", lambda: feed)
    body = client.get("/demo/earthquake").json()
    assert body["evidence"]["events_considered"] == 2
    assert body["evidence"]["highest_magnitude"] == 6.4


def test_earthquake_endpoint_handles_an_empty_feed(client, monkeypatch):
    """No qualifying events must produce a result, not a crash."""
    monkeypatch.setattr(main, "get_recent_earthquakes", lambda: {"features": []})
    response = client.get("/demo/earthquake")
    assert response.status_code == 200
    body = response.json()
    assert body["risk_score"] == 0.0
    assert body["threat_level"] == "LOW"
    assert body["alert"] is False
    assert body["evidence"]["events_considered"] == 0
