"""Output-contract tests.

The contract is the interface with the Post-Disaster Relief Network, so its
shape and its refusals are pinned here.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from schemas.events import (
    CONTRACT_VERSION,
    DataOrigin,
    DataQuality,
    DataSourceStatus,
    IntelligenceEvent,
    Location,
    ThreatAssessment,
    new_event_id,
)


def make_event(**overrides) -> IntelligenceEvent:
    payload = dict(
        event_id="flood-20260926T120000Z-abc123",
        disaster_type="flood",
        location=Location(name="Testville", latitude=27.7, longitude=85.3),
        risk_score=0.42,
        assessment=ThreatAssessment(
            threat_level="MODERATE", alert=False, reason="below threshold"
        ),
        data_quality=DataQuality(coverage=1.0, origin="live_api"),
        message="Flood threat MODERATE for Testville.",
    )
    payload.update(overrides)
    return IntelligenceEvent(**payload)


# ---------------------------------------------------------------------------
# required fields
# ---------------------------------------------------------------------------


def test_minimal_valid_event():
    event = make_event()
    assert event.contract_version == CONTRACT_VERSION
    assert event.disaster_type == "flood"
    assert event.timestamp.tzinfo is not None


def test_every_required_output_field_is_present():
    """The fields the relief network depends on."""
    payload = make_event().to_dict()
    for field in (
        "event_id",
        "disaster_type",
        "location",
        "latitude",
        "longitude",
        "risk_score",
        "assessment",
        "data_quality",
        "message",
        "evidence",
        "timestamp",
    ):
        if field in ("latitude", "longitude"):
            assert field in payload["location"]
        else:
            assert field in payload, f"missing contract field: {field}"


def test_threat_level_and_alert_are_separate_fields():
    """The alert decision must be inspectable independently of the level."""
    payload = make_event().to_dict()
    assert payload["assessment"]["threat_level"] == "MODERATE"
    assert payload["assessment"]["alert"] is False
    assert "reason" in payload["assessment"]


def test_risk_score_may_be_null_but_not_out_of_range():
    assert make_event(risk_score=None).risk_score is None
    with pytest.raises(ValidationError):
        make_event(risk_score=1.5)
    with pytest.raises(ValidationError):
        make_event(risk_score=-0.1)


def test_message_must_not_be_blank():
    with pytest.raises(ValidationError, match="message must not be blank"):
        make_event(message="   ")


def test_naive_timestamps_are_rejected():
    with pytest.raises(ValidationError, match="timezone-aware"):
        make_event(timestamp=datetime(2026, 9, 26, 12, 0, 0))


def test_observation_timestamp_may_be_absent():
    event = make_event()
    assert event.observation_timestamp is None
    assert make_event(observation_timestamp=datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# location
# ---------------------------------------------------------------------------


def test_location_defaults_to_nepal():
    assert Location(name="X", latitude=1.0, longitude=2.0).country == "Nepal"


@pytest.mark.parametrize(
    ("lat", "lon"),
    [(91.0, 0.0), (-91.0, 0.0), (0.0, 181.0), (0.0, -181.0)],
)
def test_location_rejects_impossible_coordinates(lat, lon):
    with pytest.raises(ValidationError):
        Location(name="X", latitude=lat, longitude=lon)


def test_location_accepts_any_coordinate_not_only_the_demo_places():
    """The contract must stay usable as an agent tool input.

    ``/v1/flood`` resolves a key from a fixed demo list, but the schema and the
    pipeline impose no such whitelist, so an upstream system holding real
    coordinates can call ``run_flood_pipeline`` directly. This test guards that
    decision: adding a name/enum whitelist here would silently break it.
    """
    outside_nepal = Location(name="Nowhere Special", latitude=12.3456, longitude=-45.6789)
    assert outside_nepal.latitude == pytest.approx(12.3456)
    assert outside_nepal.longitude == pytest.approx(-45.6789)
    # the only enforced constraint is physical validity
    assert set(Location.model_fields) == {
        "name",
        "latitude",
        "longitude",
        "country",
        "grid_point",
    }


# ---------------------------------------------------------------------------
# provenance
# ---------------------------------------------------------------------------


def test_data_origin_is_a_closed_set():
    for origin in ("live_api", "synthetic_demo", "partial", "none"):
        assert make_event(
            data_quality=DataQuality(coverage=1.0, origin=origin)
        ).data_quality.origin == origin
    with pytest.raises(ValidationError):
        DataQuality(coverage=1.0, origin="probably_fine")


def test_coverage_is_bounded():
    with pytest.raises(ValidationError):
        DataQuality(coverage=1.5, origin="live_api")
    with pytest.raises(ValidationError):
        DataQuality(coverage=-0.1, origin="live_api")


def test_synthetic_flag_defaults_to_false_and_is_not_derived():
    """``is_synthetic`` is stated explicitly, never guessed from the origin."""
    quality = DataQuality(coverage=1.0, origin="synthetic_demo")
    assert quality.is_synthetic is False
    quality = DataQuality(coverage=1.0, origin="synthetic_demo", is_synthetic=True)
    assert quality.is_synthetic is True


def test_source_status_records_failures():
    status = DataSourceStatus(
        name="open-meteo-flood", status="timeout", origin="none", detail="slow"
    )
    assert status.model_dump() == {
        "name": "open-meteo-flood",
        "status": "timeout",
        "origin": "none",
        "detail": "slow",
        "records": None,
    }


def test_data_origin_type_is_exported_for_consumers():
    assert "live_api" in DataOrigin.__args__


# ---------------------------------------------------------------------------
# the no-fabricated-confidence guarantee
# ---------------------------------------------------------------------------


def _all_property_names(schema: dict) -> set[str]:
    """Collect every property name in a JSON Schema, including nested models."""
    names: set[str] = set()
    stack = [schema]
    while stack:
        node = stack.pop()
        if not isinstance(node, dict):
            continue
        names.update(node.get("properties", {}).keys())
        stack.extend(node.values())
    return names


def test_contract_has_no_confidence_or_probability_field():
    """Regression guard for the project's honesty rule.

    Only *field names* are checked; descriptive prose is allowed to mention the
    word "confidence" in order to explain why there is no such field.
    """
    names = _all_property_names(IntelligenceEvent.model_json_schema())
    assert "confidence" not in names
    assert "probability" not in names
    assert "likelihood" not in names


def test_contract_instead_exposes_observable_data_quality_facts():
    names = _all_property_names(IntelligenceEvent.model_json_schema())
    assert {
        "coverage",
        "indicators_used",
        "indicators_missing",
        "origin",
        "is_synthetic",
        "sources",
        "warnings",
    } <= names


def test_to_dict_is_json_ready_with_iso_timestamps():
    payload = make_event().to_dict()
    json.dumps(payload)
    assert payload["timestamp"].endswith("+00:00") or payload[
        "timestamp"
    ].endswith("Z") or "T" in payload["timestamp"]


# ---------------------------------------------------------------------------
# event ids
# ---------------------------------------------------------------------------


def test_event_id_format():
    event_id = new_event_id("flood", datetime(2026, 9, 26, 12, 0, 0, tzinfo=timezone.utc))
    assert event_id.startswith("flood-20260926T120000Z-")
    assert len(event_id.rsplit("-", 1)[1]) == 6


def test_event_ids_are_unique_across_calls():
    ids = {new_event_id("flood") for _ in range(200)}
    assert len(ids) == 200


def test_event_id_is_stable_in_its_timestamp():
    moment = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    assert "20260102T030405Z" in new_event_id("flood", moment)
