"""End-to-end pipeline tests with injected collectors.

No network access. The collector callables are replaced with ones that either
return recorded payloads or raise a classified ``DataSourceError``, which is how
the degradation and total-failure paths are exercised.
"""

from __future__ import annotations

import json

import pytest

from collectors.base import DataSourceError, FailureReason
from pipeline import PROTOTYPE_DISCLAIMER, run_flood_pipeline
from risk.config import UNKNOWN_THREAT_LEVEL
from schemas.events import CONTRACT_VERSION, IntelligenceEvent, Location
from tests.conftest import NOW, daily_payload, hourly_payload

PLACE = Location(name="Testville", latitude=27.7172, longitude=85.324)


def ok_weather(**kwargs):
    def fetch(lat: float, lon: float, **_):
        return hourly_payload([1.0] * 72 + [0.0] * 24, **kwargs)

    return fetch


def ok_flood(discharges=None, **kwargs):
    def fetch(lat: float, lon: float, **_):
        return daily_payload(discharges or [5.0] * 10, **kwargs)

    return fetch


def broken(reason: str):
    def fetch(*_, **__):
        raise DataSourceError("test-source", reason, "simulated")

    return fetch


def run(**kwargs) -> IntelligenceEvent:
    params = dict(
        weather_fetcher=ok_weather(),
        flood_fetcher=ok_flood(),
        now=NOW,
    )
    params.update(kwargs)
    return run_flood_pipeline(PLACE, **params)


# ---------------------------------------------------------------------------
# happy path
# ---------------------------------------------------------------------------


def test_full_run_produces_a_valid_contract_object():
    event = run()
    assert isinstance(event, IntelligenceEvent)
    assert event.contract_version == CONTRACT_VERSION
    assert event.disaster_type == "flood"
    assert event.location.name == "Testville"
    assert event.data_quality.origin == "live_api"
    assert event.data_quality.is_synthetic is False
    assert event.data_quality.coverage == pytest.approx(1.0)
    assert event.risk_score is not None
    assert 0.0 <= event.risk_score <= 1.0


def test_all_three_stages_are_present_and_separate():
    event = run()
    # risk stage
    assert isinstance(event.risk_score, float)
    # classification stage
    assert event.assessment.threat_level in {"LOW", "MODERATE", "HIGH", "CRITICAL"}
    # alert stage
    assert isinstance(event.assessment.alert, bool)
    assert event.assessment.reason


def test_sources_are_recorded_with_record_counts():
    event = run()
    weather, flood = event.data_quality.sources
    assert weather.name == "open-meteo-weather"
    assert weather.status == "ok"
    assert weather.records == 96  # 96 hourly steps
    assert flood.name == "open-meteo-flood-glofas"
    assert flood.status == "ok"
    assert flood.records == 10  # 10 daily steps


def test_message_always_carries_the_disclaimer():
    assert PROTOTYPE_DISCLAIMER in run().message


def test_output_is_json_serialisable():
    payload = run().to_dict()
    json.dumps(payload)
    assert payload["assessment"]["threat_level"]
    assert "evidence" in payload


def test_event_id_shape_and_uniqueness():
    first, second = run(), run()
    for event in (first, second):
        assert event.event_id.startswith("flood-")
        assert len(event.event_id.split("-")) == 3
    assert first.event_id != second.event_id


def test_timestamp_uses_the_injected_clock():
    assert run().timestamp == NOW


def test_no_confidence_field_exists_in_the_contract():
    """The contract must not carry an unjustified confidence number."""
    payload = run().to_dict()
    assert "confidence" not in payload
    assert "confidence" not in payload["assessment"]
    assert "confidence" not in payload["data_quality"]
    assert "data_quality" in payload


# ---------------------------------------------------------------------------
# degradation
# ---------------------------------------------------------------------------


def test_weather_failure_degrades_to_partial_without_raising():
    event = run(weather_fetcher=broken(FailureReason.TIMEOUT))
    assert event.data_quality.origin == "partial"
    assert event.data_quality.is_synthetic is False
    # Without rainfall, the two discharge indicators are all that survive.
    assert set(event.data_quality.indicators_missing) == {
        "antecedent_rainfall",
        "forecast_rainfall",
    }
    assert set(event.data_quality.indicators_used) == {
        "discharge_level",
        "discharge_rise",
    }
    assert event.risk_score is not None
    failures = [s for s in event.data_quality.sources if s.status != "ok"]
    assert len(failures) == 1
    assert failures[0].status == FailureReason.TIMEOUT
    assert any("open-meteo-weather unavailable" in w for w in event.data_quality.warnings)


def test_flood_failure_degrades_to_partial():
    event = run(flood_fetcher=broken(FailureReason.HTTP_ERROR))
    assert event.data_quality.origin == "partial"
    assert "discharge_level" in event.data_quality.indicators_missing
    assert "discharge_rise" in event.data_quality.indicators_missing


def test_partial_data_suppresses_a_qualifying_alert():
    """Heavy rain with no discharge must not auto-publish a warning."""
    def heavy_rain(lat, lon, **_):
        return hourly_payload([10.0] * 96)

    event = run(weather_fetcher=heavy_rain, flood_fetcher=broken(FailureReason.TIMEOUT))
    assert event.assessment.threat_level in {"HIGH", "CRITICAL"}
    assert event.assessment.alert is False
    assert event.assessment.suppressed is True
    assert event.assessment.requires_manual_verification is True


def test_both_sources_failing_yields_unknown_and_no_alert():
    event = run(
        weather_fetcher=broken(FailureReason.NETWORK_UNREACHABLE),
        flood_fetcher=broken(FailureReason.TIMEOUT),
    )
    assert event.data_quality.origin == "none"
    assert event.risk_score is None
    assert event.assessment.threat_level == UNKNOWN_THREAT_LEVEL
    assert event.assessment.alert is False
    assert event.assessment.recommendation == "acquire_data"
    assert "could not be determined" in event.message


def test_a_collector_bug_does_not_kill_the_run():
    def explode(*_, **__):
        raise ZeroDivisionError("bug in a collector")

    event = run(weather_fetcher=explode)
    assert event.data_quality.origin == "partial"
    assert any("unexpected error" in w for w in event.data_quality.warnings)
    assert event.assessment.threat_level != UNKNOWN_THREAT_LEVEL


def test_one_empty_payload_degrades_to_partial():
    event = run(flood_fetcher=lambda *a, **k: {})
    assert event.data_quality.origin == "partial"
    empty = [s for s in event.data_quality.sources if s.name == "open-meteo-flood-glofas"]
    assert empty[0].status == "empty_payload"
    assert event.risk_score is not None  # rainfall-only is still assessable
    assert event.assessment.alert is False  # ...but cannot auto-alert


def test_both_payloads_empty_yields_no_usable_data():
    event = run(weather_fetcher=lambda *a, **k: {}, flood_fetcher=lambda *a, **k: {})
    assert event.data_quality.origin == "none"
    assert event.risk_score is None
    assert event.assessment.threat_level == UNKNOWN_THREAT_LEVEL
    assert all(s.status == "empty_payload" for s in event.data_quality.sources)


# ---------------------------------------------------------------------------
# provenance labelling
# ---------------------------------------------------------------------------


def test_synthetic_origin_is_propagated_and_warned_about():
    event = run(data_origin="synthetic_demo")
    assert event.data_quality.origin == "synthetic_demo"
    assert event.data_quality.is_synthetic is True
    assert any("not from a live API call" in w for w in event.data_quality.warnings)


def test_per_source_origin_never_contradicts_the_run_provenance():
    """A synthetic run must not leave ``origin='live_api'`` in its own records."""
    synthetic = run(data_origin="synthetic_demo")
    assert {s.origin for s in synthetic.data_quality.sources} == {"synthetic_demo"}

    live = run()
    assert {s.origin for s in live.data_quality.sources} == {"live_api"}


def test_caller_can_flag_degradation_explicitly():
    event = run(degraded=True)
    assert event.data_quality.origin == "partial"


# ---------------------------------------------------------------------------
# evidence
# ---------------------------------------------------------------------------


def test_evidence_carries_measurements_method_and_thresholds():
    evidence = run().evidence
    assert "measurements" in evidence
    assert evidence["is_machine_learning"] is False
    assert "thresholds" in evidence
    assert "coverage" in evidence
    assert evidence["model_grid"]["note"]


def test_evidence_lists_every_indicator_with_its_contribution():
    indicators = run().evidence["indicators"]
    assert len(indicators) == 4
    for item in indicators:
        assert set(item) >= {
            "key",
            "weight",
            "available",
            "raw_value",
            "normalized",
            "contribution",
            "note",
        }


# ---------------------------------------------------------------------------
# grid provenance
# ---------------------------------------------------------------------------


def test_both_grid_sources_present_marks_the_event_as_a_grid_point():
    event = run()
    assert event.location.grid_point is True
    assert event.evidence["model_grid"]["weather"] is not None
    assert event.evidence["model_grid"]["flood"] is not None


def test_weather_only_run_still_reports_a_grid_point():
    """Regression guard: ``grid_point`` used to depend on the flood grid alone.

    A weather-only run publishes rainfall snapped to a model grid cell, so
    reporting ``grid_point=False`` while ``evidence.model_grid.weather`` was
    populated under-reported the use of gridded data.
    """
    event = run(flood_fetcher=broken(FailureReason.TIMEOUT))
    assert event.data_quality.origin == "partial"
    assert event.evidence["model_grid"]["flood"] is None
    assert event.evidence["model_grid"]["weather"] is not None
    assert event.location.grid_point is True


def test_flood_only_run_still_reports_a_grid_point():
    event = run(weather_fetcher=broken(FailureReason.TIMEOUT))
    assert event.evidence["model_grid"]["weather"] is None
    assert event.evidence["model_grid"]["flood"] is not None
    assert event.location.grid_point is True


def test_no_grid_source_reports_no_grid_point():
    """Both sources down means no gridded data was used at all."""
    event = run(
        weather_fetcher=broken(FailureReason.TIMEOUT),
        flood_fetcher=broken(FailureReason.TIMEOUT),
    )
    assert event.evidence["model_grid"]["weather"] is None
    assert event.evidence["model_grid"]["flood"] is None
    assert event.location.grid_point is False

