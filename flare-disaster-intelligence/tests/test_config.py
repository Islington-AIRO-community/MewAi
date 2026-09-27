"""Configuration tests.

These guard the honesty guarantees: thresholds live in exactly one place, they
are internally consistent, and the published description says out loud that the
method is a rule-based prototype and not a trained model.
"""

from __future__ import annotations

from dataclasses import replace

import pytest

from risk import config
from risk.config import (
    ALERT_POLICY,
    CALIBRATION_STATUS,
    DISCHARGE_HIGH_M3S,
    DISCHARGE_LOW_M3S,
    FLOOD_INDICATORS,
    METHOD_TYPE,
    RAIN_HIGH_MM,
    RAIN_LOW_MM,
    RISE_RATIO_FULL,
    RISE_RATIO_NEUTRAL,
    THREAT_BANDS,
    UNKNOWN_THREAT_LEVEL,
    describe_thresholds,
    indicator_weight_total,
    validate_config,
)
from risk.threat import classify_threat


def test_shipped_configuration_is_valid():
    validate_config()


def test_indicator_weights_sum_to_one():
    assert indicator_weight_total() == pytest.approx(1.0)
    assert sum(i.weight for i in FLOOD_INDICATORS) == pytest.approx(1.0)


def test_indicator_keys_are_unique():
    keys = [i.key for i in FLOOD_INDICATORS]
    assert len(keys) == len(set(keys))


def test_every_indicator_declares_a_unit_and_a_label():
    for indicator in FLOOD_INDICATORS:
        assert indicator.label
        assert indicator.unit
        assert 0.0 < indicator.weight < 1.0


def test_method_is_declared_as_rule_based_not_machine_learning():
    assert config.IS_MACHINE_LEARNING is False
    assert METHOD_TYPE == "rule_based_deterministic_composite_index"
    assert "PROTOTYPE ASSUMPTIONS" in CALIBRATION_STATUS
    assert "not Nepal-calibrated" in CALIBRATION_STATUS


def test_calibration_status_denies_validation_and_official_thresholds():
    lowered = CALIBRATION_STATUS.lower()
    assert "official" in lowered
    assert "validated" in lowered
    assert "warning thresholds" in lowered


def test_threat_bands_start_at_zero_and_increase():
    assert THREAT_BANDS[0].min_score == 0.0
    scores = [band.min_score for band in THREAT_BANDS]
    assert scores == sorted(scores)
    assert len(set(scores)) == len(scores)


def test_unknown_is_distinct_from_the_canonical_levels():
    assert UNKNOWN_THREAT_LEVEL not in config.THREAT_LEVELS
    assert UNKNOWN_THREAT_LEVEL == "UNKNOWN"


def test_alert_policy_matches_the_documented_fail_safe():
    assert ALERT_POLICY.alerting_levels == frozenset({"HIGH", "CRITICAL"})
    assert ALERT_POLICY.min_coverage_to_alert == 1.0
    assert ALERT_POLICY.advisory_levels == frozenset({"MODERATE"})


# ---------------------------------------------------------------------------
# guards against an inconsistent configuration
# ---------------------------------------------------------------------------


def test_validate_config_rejects_bad_weights():
    """An indicator weight that breaks the sum must be caught at start-up."""
    broken = replace(FLOOD_INDICATORS[0], weight=0.9)
    with pytest.raises(ValueError, match="must sum to 1.0"):
        _validate_with((broken,) + FLOOD_INDICATORS[1:])


def test_validate_config_rejects_duplicate_indicator_keys():
    duplicated = replace(FLOOD_INDICATORS[1], key=FLOOD_INDICATORS[0].key)
    with pytest.raises(ValueError, match="must be unique"):
        _validate_with((FLOOD_INDICATORS[0], duplicated) + FLOOD_INDICATORS[2:])


def _validate_with(indicators) -> None:
    """Run ``validate_config`` against a temporarily patched indicator tuple."""
    original = config.FLOOD_INDICATORS
    try:
        config.FLOOD_INDICATORS = indicators  # type: ignore[misc]
        validate_config()
    finally:
        config.FLOOD_INDICATORS = original  # type: ignore[misc]


def test_validate_config_rejects_inverted_rainfall_bands():
    original = config.RAIN_HIGH_MM
    try:
        config.RAIN_HIGH_MM = 1.0
        with pytest.raises(ValueError, match="RAIN_HIGH_MM"):
            validate_config()
    finally:
        config.RAIN_HIGH_MM = original


def test_validate_config_rejects_inverted_discharge_bands():
    original = config.DISCHARGE_HIGH_M3S
    try:
        config.DISCHARGE_HIGH_M3S = 0.0
        with pytest.raises(ValueError, match="DISCHARGE_HIGH_M3S"):
            validate_config()
    finally:
        config.DISCHARGE_HIGH_M3S = original


def test_validate_config_rejects_inverted_rise_bands():
    original = config.RISE_RATIO_FULL
    try:
        config.RISE_RATIO_FULL = 0.5
        with pytest.raises(ValueError, match="RISE_RATIO_FULL"):
            validate_config()
    finally:
        config.RISE_RATIO_FULL = original


def test_validate_config_rejects_non_increasing_threat_bands():
    """A boundary that moves backwards breaks the ordering, not just the tiling."""
    original = config.THREAT_BANDS
    try:
        config.THREAT_BANDS = (
            replace(original[0], min_score=0.0),
            replace(original[1], min_score=0.60),
            replace(original[2], min_score=0.50),  # goes backwards
            replace(original[3], min_score=0.75),
        )
        with pytest.raises(ValueError, match="strictly increase"):
            validate_config()
    finally:
        config.THREAT_BANDS = original


def test_validate_config_rejects_a_degenerate_final_threat_band():
    """Regression guard: a final band pinned to 1.0 must not be accepted.

    Boundaries still strictly increase and the first band still starts at 0.0,
    so the old ordering check let this through. At runtime it left the whole
    ``[0.50, 1.0)`` range reporting ``HIGH`` and made ``CRITICAL`` reachable only
    at the single point ``1.0``, contradicting the documented ``[0.75, 1.00]``.
    """
    original = config.THREAT_BANDS
    try:
        config.THREAT_BANDS = (
            replace(original[0], min_score=0.0),
            replace(original[1], min_score=0.25),
            replace(original[2], min_score=0.50),
            replace(original[3], min_score=1.0),
        )
        # widths 0.25 / 0.25 / 0.5 / 0.0: HIGH is over-wide and CRITICAL is
        # zero-width, so both are rejected.
        assert config.threat_band_gaps(config.THREAT_BANDS) == ["HIGH", "CRITICAL"]
        with pytest.raises(ValueError, match="contiguously"):
            validate_config()
    finally:
        config.THREAT_BANDS = original


@pytest.mark.parametrize(
    ("boundaries", "expected_gaps"),
    [
        # The reviewer's case: widths 0.25 / 0.35 / 0.15 / 0.25. Every score is
        # still assigned, so only the uneven-width check can catch it.
        ((0.00, 0.25, 0.60, 0.75), ["MODERATE", "HIGH"]),
        # the final band squeezed shut against 1.0
        ((0.00, 0.25, 0.50, 0.90), ["HIGH", "CRITICAL"]),
        # the first band stretched wide, pushing everything else out of shape
        ((0.00, 0.40, 0.50, 0.75), ["MODERATE", "HIGH", "CRITICAL"]),
    ],
)
def test_validate_config_rejects_an_internal_band_gap(boundaries, expected_gaps):
    """Regression guard: an internal gap must be rejected, not silently accepted.

    With ``min_score``-only bands every upper bound is derived from the next
    band, so no score is ever unclassified and the strict-increase check passes.
    Such a config silently contradicts the published equal-quarter table, which
    is what ``threat_band_gaps`` now verifies.
    """
    original = config.THREAT_BANDS
    try:
        config.THREAT_BANDS = tuple(
            replace(band, min_score=boundary)
            for band, boundary in zip(original, boundaries)
        )
        assert config.threat_band_gaps(config.THREAT_BANDS) == expected_gaps
        with pytest.raises(ValueError, match="contiguously"):
            validate_config()
    finally:
        config.THREAT_BANDS = original


def test_threat_band_check_is_generic_not_hard_coded_to_quarters():
    """The rule is "every band is the same width", not "the width is 0.25".

    A different number of bands, or a different width, is accepted as long as
    the partition is even, so the validator is not welded to the shipped table.
    """
    sixths = tuple(
        config.ThreatBand(f"L{index}", index / 6, "d") for index in range(6)
    )
    assert config.threat_band_gaps(sixths) == []

    # Moving only the last boundary makes the final two widths wrong
    # (0.2333 and 0.1 instead of 0.1667), so both are reported.
    uneven = tuple(
        config.ThreatBand(f"L{index}", index / 6, "d") for index in range(5)
    ) + (config.ThreatBand("L5", 0.9, "d"),)
    assert config.threat_band_gaps(uneven) == ["L4", "L5"]


def test_shipped_threat_bands_tile_the_unit_interval_without_gaps():
    assert config.threat_band_gaps() == []


def test_every_shipped_band_owns_the_range_it_documents():
    """Each band's own midpoint must classify as that band, via the real classifier."""
    bounds = config.threat_band_bounds()
    assert [entry["level"] for entry in bounds] == list(config.THREAT_LEVELS)
    for entry in bounds:
        midpoint = (entry["min_risk_score"] + entry["max_risk_score"]) / 2.0
        assert classify_threat(midpoint) == entry["level"]


def test_published_band_bounds_are_contiguous_and_end_at_one():
    bounds = config.threat_band_bounds()
    assert bounds[0]["min_risk_score"] == 0.0
    assert bounds[-1]["max_risk_score"] == 1.0
    assert bounds[-1]["max_inclusive"] is True
    for current, following in zip(bounds, bounds[1:]):
        # each band ends exactly where the next one starts
        assert current["max_risk_score"] == following["min_risk_score"]
        assert current["max_inclusive"] is False


def test_band_lookup_mirror_agrees_with_the_real_classifier():
    """``_classify_with_bands`` mirrors ``classify_threat``; keep them in step."""
    for step in range(0, 1001):
        score = step / 1000.0
        assert config._classify_with_bands(score, config.THREAT_BANDS) == classify_threat(
            score
        )


def test_validate_config_rejects_a_missing_threat_level():
    original = config.THREAT_BANDS
    try:
        config.THREAT_BANDS = original[:-1]
        with pytest.raises(ValueError, match="must be exactly"):
            validate_config()
    finally:
        config.THREAT_BANDS = original


def test_shipped_band_values_are_ordered():
    assert RAIN_LOW_MM < RAIN_HIGH_MM
    assert DISCHARGE_LOW_M3S < DISCHARGE_HIGH_M3S
    assert RISE_RATIO_NEUTRAL < RISE_RATIO_FULL


# ---------------------------------------------------------------------------
# published description
# ---------------------------------------------------------------------------


def test_describe_thresholds_is_complete_and_serialisable():
    import json

    payload = describe_thresholds()
    json.dumps(payload)
    assert payload["method"]["is_machine_learning"] is False
    assert "PROTOTYPE" in payload["method"]["calibration_status"]
    assert len(payload["indicators"]) == 4
    assert len(payload["threat_levels"]) == 4
    assert payload["alert_policy"]["alerting_levels"] == ["CRITICAL", "HIGH"]
    assert payload["unknown_threat_level"] == "UNKNOWN"


def test_describe_thresholds_matches_the_live_constants():
    payload = describe_thresholds()
    assert payload["bands"]["rainfall_mm"] == {
        "low": RAIN_LOW_MM,
        "high": RAIN_HIGH_MM,
    }
    assert payload["bands"]["discharge_m3s"] == {
        "low": DISCHARGE_LOW_M3S,
        "high": DISCHARGE_HIGH_M3S,
    }
