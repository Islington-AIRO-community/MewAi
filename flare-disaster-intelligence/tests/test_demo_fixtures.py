"""Synthetic demo scenario tests.

These assert that each scenario produces the outcome its own description claims,
and - just as importantly - that synthetic results are labelled synthetic.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from demo.fixtures import (
    SCENARIO_FILE,
    ScenarioNotFound,
    available_scenarios,
    load_scenario,
)
from main import DEMO_LOCATIONS, run_flood_offline

NOW = datetime(2026, 9, 26, 12, 0, tzinfo=timezone.utc)


def test_scenario_file_carries_a_prominent_synthetic_warning():
    document = json.loads(SCENARIO_FILE.read_text(encoding="utf-8"))
    warning = " ".join(document["_README"]).lower()
    assert "synthetic demo data" in warning
    assert "not observed" in warning
    assert "none of it is a real observation" in warning
    assert "is_synthetic = true" in warning


def test_every_scenario_has_a_description_and_expected_outcome():
    document = json.loads(SCENARIO_FILE.read_text(encoding="utf-8"))
    for name, scenario in document["scenarios"].items():
        assert scenario["description"], f"{name} has no description"
        assert "expected" in scenario, f"{name} has no expected outcome"


def test_available_scenarios_lists_all_of_them():
    assert set(available_scenarios()) == {
        "calm",
        "rising",
        "severe",
        "no_discharge_data",
        "malformed",
    }


def test_unknown_scenario_raises():
    with pytest.raises(ScenarioNotFound):
        load_scenario("no-such-scenario")


def test_materialised_payloads_have_the_api_shape():
    weather, flood = load_scenario("rising", now=NOW)
    assert {"time", "precipitation"} <= set(weather["hourly"])
    assert weather["hourly_units"]["precipitation"] == "mm"
    assert {"time", "river_discharge", "river_discharge_mean"} <= set(flood["daily"])
    assert flood["daily_units"]["river_discharge"] == "m3/s"


def test_materialised_time_axis_is_anchored_to_now():
    weather, flood = load_scenario("rising", now=NOW)
    first = weather["hourly"]["time"][0]
    last = weather["hourly"]["time"][-1]
    assert first == "2026-09-23T12:00"  # NOW - 72h
    assert last.startswith("2026-09-29")  # NOW + 71h
    assert flood["daily"]["time"][0] == "2026-09-19"  # today - 7 days
    assert flood["daily"]["time"][7] == "2026-09-26"  # today


def test_scenarios_are_deterministic_for_a_fixed_clock():
    first = load_scenario("severe", now=NOW)
    second = load_scenario("severe", now=NOW)
    assert first == second


# ---------------------------------------------------------------------------
# documented outcomes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("scenario", "threat", "alert"),
    [
        ("calm", "LOW", False),
        ("rising", "MODERATE", False),
        ("severe", "CRITICAL", True),
    ],
)
def test_scenario_outcomes_match_their_documentation(scenario, threat, alert):
    event = run_flood_offline(DEMO_LOCATIONS["kathmandu"], scenario)
    assert event.assessment.threat_level == threat
    assert event.assessment.alert is alert


def test_no_discharge_scenario_demonstrates_the_fail_safe():
    event = run_flood_offline(DEMO_LOCATIONS["kathmandu"], "no_discharge_data")
    assert event.assessment.threat_level == "HIGH"
    assert event.assessment.alert is False
    assert event.assessment.suppressed is True
    assert event.assessment.requires_manual_verification is True
    assert event.data_quality.coverage < 1.0
    assert set(event.data_quality.indicators_missing) == {
        "discharge_level",
        "discharge_rise",
    }


def test_malformed_scenario_still_produces_a_result_with_warnings():
    event = run_flood_offline(DEMO_LOCATIONS["kathmandu"], "malformed")
    assert event.disaster_type == "flood"
    assert event.data_quality.warnings
    assert 0.0 < event.data_quality.coverage < 1.0


def test_every_offline_result_is_labelled_synthetic():
    for name in available_scenarios():
        event = run_flood_offline(DEMO_LOCATIONS["kathmandu"], name)
        assert event.data_quality.origin == "synthetic_demo"
        assert event.data_quality.is_synthetic is True
        assert all(s.origin == "synthetic_demo" for s in event.data_quality.sources)
        assert any("offline fixtures" in w for w in event.data_quality.warnings)
        assert event.evidence["is_machine_learning"] is False
