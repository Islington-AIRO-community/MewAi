"""Flood risk engine tests with controlled, hand-checkable inputs.

Every expected score in this file is derived by hand from the documented
formula in ``risk/config.py``; none of it was copied from a previous run.
"""

from __future__ import annotations

import pytest

from processing.flood_features import FloodFeatures
from risk.config import (
    DISCHARGE_HIGH_M3S,
    DISCHARGE_LOW_M3S,
    FLOOD_INDICATORS,
    RAIN_HIGH_MM,
    RAIN_LOW_MM,
    RISE_RATIO_FULL,
    RISE_RATIO_NEUTRAL,
)
from risk.flood import _normalise, assess_flood_risk

ALL_KEYS = [indicator.key for indicator in FLOOD_INDICATORS]


def features(**overrides) -> FloodFeatures:
    """A fully-populated feature set; override only what a test cares about."""
    base = dict(
        rainfall_past_24h_mm=0.0,
        rainfall_past_72h_mm=0.0,
        rainfall_forecast_72h_mm=0.0,
        discharge_latest_m3s=0.0,
        discharge_baseline_m3s=100.0,
        discharge_observed_days=7,
    )
    base.update(overrides)
    return FloodFeatures(**base)


def indicator(assessment, key):
    return next(i for i in assessment.indicators if i.key == key)


# ---------------------------------------------------------------------------
# The normalise primitive
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (-100.0, 0.0),   # clamps low
        (0.0, 0.0),      # at the low edge
        (10.0, 0.5),     # midpoint
        (20.0, 1.0),     # at the high edge
        (9999.0, 1.0),   # clamps high
    ],
)
def test_normalise_clamps_and_interpolates(value, expected):
    assert _normalise(value, 0.0, 20.0) == pytest.approx(expected)


def test_normalise_handles_a_degenerate_band():
    assert _normalise(5.0, 10.0, 10.0) == 0.0


# ---------------------------------------------------------------------------
# Boundaries
# ---------------------------------------------------------------------------


def test_all_indicators_at_zero_gives_zero_risk():
    assessment = assess_flood_risk(
        features(
            rainfall_past_72h_mm=0.0,
            rainfall_forecast_72h_mm=0.0,
            discharge_latest_m3s=0.0,
            discharge_baseline_m3s=100.0,
        )
    )
    assert assessment.risk_score == 0.0
    assert assessment.coverage == 1.0


def test_all_indicators_saturated_gives_full_risk():
    assessment = assess_flood_risk(
        features(
            rainfall_past_72h_mm=RAIN_HIGH_MM,
            rainfall_forecast_72h_mm=RAIN_HIGH_MM,
            discharge_latest_m3s=DISCHARGE_HIGH_M3S,
            discharge_baseline_m3s=DISCHARGE_LOW_M3S,
        )
    )
    assert assessment.risk_score == 1.0
    assert all(i.normalized == 1.0 for i in assessment.indicators)


def test_risk_score_is_always_within_the_unit_interval():
    for rainfall in (0.0, 5.0, 60.0, 500.0):
        for discharge in (0.0, 12.0, 250.0, 9000.0):
            assessment = assess_flood_risk(
                features(
                    rainfall_past_72h_mm=rainfall,
                    rainfall_forecast_72h_mm=rainfall,
                    discharge_latest_m3s=discharge,
                    discharge_baseline_m3s=10.0,
                )
            )
            assert 0.0 <= assessment.risk_score <= 1.0


# ---------------------------------------------------------------------------
# Exact arithmetic
# ---------------------------------------------------------------------------


def test_hand_computed_score_for_a_mixed_event():
    """Weights: rainfall 0.30 + 0.15, discharge level 0.35, rise 0.20.

    antecedent 70mm -> (70-20)/100 = 0.50 -> 0.30 * 0.50 = 0.150
    forecast    50mm -> (50-20)/100 = 0.30 -> 0.15 * 0.30 = 0.045
    discharge  215m3/s -> (215-30)/370 = 0.50 -> 0.35 * 0.50 = 0.175
    rise ratio 2.5x -> (2.5-1)/3 = 0.50  -> 0.20 * 0.50 = 0.100
    total = 0.470
    """
    assessment = assess_flood_risk(
        features(
            rainfall_past_72h_mm=70.0,
            rainfall_forecast_72h_mm=50.0,
            discharge_latest_m3s=215.0,
            discharge_baseline_m3s=86.0,  # 215 / 86 = 2.5
        )
    )
    assert assessment.risk_score == pytest.approx(0.470, abs=1e-3)
    assert assessment.coverage == 1.0
    assert assessment.has_full_coverage is True


def test_contributions_sum_to_the_risk_score():
    assessment = assess_flood_risk(
        features(
            rainfall_past_72h_mm=70.0,
            rainfall_forecast_72h_mm=50.0,
            discharge_latest_m3s=215.0,
            discharge_baseline_m3s=86.0,
        )
    )
    total = sum(i.contribution for i in assessment.indicators)
    assert total == pytest.approx(assessment.risk_score, abs=1e-3)


def test_effective_weights_sum_to_one_at_full_coverage():
    assessment = assess_flood_risk(features(rainfall_past_72h_mm=70.0))
    assert sum(i.effective_weight for i in assessment.indicators) == pytest.approx(1.0)
    for item in assessment.indicators:
        assert item.effective_weight == pytest.approx(item.weight)


# ---------------------------------------------------------------------------
# Indicator-by-indicator behaviour
# ---------------------------------------------------------------------------


def test_rainfall_indicators_clamp_below_the_low_band():
    assessment = assess_flood_risk(
        features(rainfall_past_72h_mm=RAIN_LOW_MM - 10, rainfall_forecast_72h_mm=0.0)
    )
    assert indicator(assessment, "antecedent_rainfall").normalized == 0.0


def test_forecast_rainfall_is_weighted_lowest():
    weights = {i.key: i.weight for i in FLOOD_INDICATORS}
    assert weights["forecast_rainfall"] == min(weights.values())


def test_discharge_level_uses_absolute_bands_not_self_referential_ones():
    """Doubling the forecast must not change the discharge-level component."""
    first = assess_flood_risk(features(discharge_latest_m3s=200.0))
    second = assess_flood_risk(features(discharge_latest_m3s=200.0))
    assert (
        indicator(first, "discharge_level").normalized
        == indicator(second, "discharge_level").normalized
    )
    expected = (200.0 - DISCHARGE_LOW_M3S) / (DISCHARGE_HIGH_M3S - DISCHARGE_LOW_M3S)
    assert indicator(first, "discharge_level").normalized == pytest.approx(expected)


def test_discharge_rise_is_zero_at_or_below_baseline():
    for latest in (50.0, 100.0):
        assessment = assess_flood_risk(
            features(discharge_latest_m3s=latest, discharge_baseline_m3s=100.0)
        )
        result = indicator(assessment, "discharge_rise")
        assert result.available is True
        assert result.normalized == 0.0
        assert "no rising limb" in result.note


def test_discharge_rise_saturates_at_the_full_ratio():
    assessment = assess_flood_risk(
        features(discharge_latest_m3s=100.0 * RISE_RATIO_FULL, discharge_baseline_m3s=100.0)
    )
    result = indicator(assessment, "discharge_rise")
    assert result.normalized == 1.0
    assert result.raw_value == pytest.approx(RISE_RATIO_FULL)


def test_discharge_rise_ignores_a_near_zero_baseline():
    assessment = assess_flood_risk(
        features(discharge_latest_m3s=50.0, discharge_baseline_m3s=0.2)
    )
    result = indicator(assessment, "discharge_rise")
    assert result.available is False
    assert "meaningless" in result.note


def test_discharge_rise_neutral_ratio_contributes_nothing():
    assessment = assess_flood_risk(
        features(discharge_latest_m3s=100.0, discharge_baseline_m3s=100.0)
    )
    assert indicator(assessment, "discharge_rise").raw_value == pytest.approx(
        RISE_RATIO_NEUTRAL
    )


# ---------------------------------------------------------------------------
# Missing and invalid data
# ---------------------------------------------------------------------------


def test_no_indicator_available_yields_no_score():
    assessment = assess_flood_risk(FloodFeatures())
    assert assessment.risk_score is None
    assert assessment.coverage == 0.0
    assert assessment.missing_indicators == tuple(ALL_KEYS)
    assert all(not i.available for i in assessment.indicators)


def test_weights_are_renormalised_over_available_indicators():
    """Rainfall only: 0.30 and 0.15 of 1.00 total -> coverage 0.45."""
    assessment = assess_flood_risk(
        FloodFeatures(rainfall_past_72h_mm=120.0, rainfall_forecast_72h_mm=0.0)
    )
    assert assessment.coverage == pytest.approx(0.45)
    assert assessment.missing_indicators == ("discharge_level", "discharge_rise")
    # (0.30 * 1.0 + 0.15 * 0.0) / 0.45
    assert assessment.risk_score == pytest.approx(0.6667, abs=1e-3)
    assert any("renormalised" in note for note in assessment.notes)


def test_partial_data_can_produce_a_qualifying_threat_level():
    """A HIGH threat on partial data is a hypothesis, not a warning."""
    from risk.alert import decide_alert
    from risk.threat import classify_threat

    assessment = assess_flood_risk(
        FloodFeatures(rainfall_past_72h_mm=120.0, rainfall_forecast_72h_mm=0.0)
    )
    assert classify_threat(assessment.risk_score) == "HIGH"
    decision = decide_alert(
        classify_threat(assessment.risk_score),
        coverage=assessment.coverage,
        missing_indicators=assessment.missing_indicators,
    )
    assert decision.alert is False
    assert decision.requires_manual_verification is True


@pytest.mark.parametrize("bad", [-1.0, -100.0])
def test_negative_rainfall_is_rejected_not_clamped(bad):
    assessment = assess_flood_risk(
        FloodFeatures(rainfall_past_72h_mm=bad, rainfall_forecast_72h_mm=bad)
    )
    for key in ("antecedent_rainfall", "forecast_rainfall"):
        result = indicator(assessment, key)
        assert result.available is False
        assert "Negative" in result.note
    assert assessment.risk_score is None


def test_negative_discharge_is_rejected():
    assessment = assess_flood_risk(features(discharge_latest_m3s=-5.0))
    assert indicator(assessment, "discharge_level").available is False


def test_missing_baseline_disables_only_the_rise_indicator():
    assessment = assess_flood_risk(
        FloodFeatures(
            rainfall_past_72h_mm=60.0, discharge_latest_m3s=120.0
        )
    )
    assert indicator(assessment, "discharge_rise").available is False
    assert indicator(assessment, "discharge_level").available is True
    assert assessment.coverage == pytest.approx(0.65)


def test_short_discharge_history_is_flagged():
    assessment = assess_flood_risk(
        features(discharge_latest_m3s=200.0, discharge_observed_days=1)
    )
    assert any("short past record" in note for note in assessment.notes)


def test_full_history_is_not_flagged():
    assessment = assess_flood_risk(
        features(discharge_latest_m3s=200.0, discharge_observed_days=7)
    )
    assert not any("short past record" in note for note in assessment.notes)


# ---------------------------------------------------------------------------
# Honesty of the published evidence
# ---------------------------------------------------------------------------


def test_evidence_declares_the_method_is_not_machine_learning():
    evidence = assess_flood_risk(features(rainfall_past_72h_mm=70.0)).as_evidence()
    assert evidence["is_machine_learning"] is False
    assert evidence["method_type"] == "rule_based_deterministic_composite_index"
    assert "PROTOTYPE ASSUMPTIONS" in evidence["calibration_status"]


def test_evidence_publishes_every_threshold_used():
    evidence = assess_flood_risk(features()).as_evidence()
    assert evidence["thresholds"]["rainfall_mm"] == {
        "low": RAIN_LOW_MM,
        "high": RAIN_HIGH_MM,
    }
    assert evidence["thresholds"]["discharge_m3s"] == {
        "low": DISCHARGE_LOW_M3S,
        "high": DISCHARGE_HIGH_M3S,
    }


def test_engine_is_deterministic():
    data = features(
        rainfall_past_72h_mm=70.0,
        rainfall_forecast_72h_mm=50.0,
        discharge_latest_m3s=215.0,
        discharge_baseline_m3s=86.0,
    )
    first = assess_flood_risk(data)
    second = assess_flood_risk(data)
    assert first.risk_score == second.risk_score
    assert first.as_evidence() == second.as_evidence()
