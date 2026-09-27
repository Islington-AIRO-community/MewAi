"""Threat classification tests (risk score -> LOW / MODERATE / HIGH / CRITICAL)."""

from __future__ import annotations

import math

import pytest

from risk.config import THREAT_BANDS, THREAT_LEVELS, UNKNOWN_THREAT_LEVEL
from risk.threat import classify_threat, describe_threat


def test_threat_boundaries():
    """Original prototype test, kept unchanged."""
    assert classify_threat(0.10) == "LOW"
    assert classify_threat(0.30) == "MODERATE"
    assert classify_threat(0.60) == "HIGH"
    assert classify_threat(0.90) == "CRITICAL"


def test_alerts():
    """Original prototype test, kept unchanged. The implementation now lives
    in ``risk.alert``; this still asserts the level-only behaviour."""
    from risk.threat import alert_required

    assert alert_required("LOW") is False
    assert alert_required("MODERATE") is False
    assert alert_required("HIGH") is True
    assert alert_required("CRITICAL") is True


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (0.0, "LOW"),
        (0.2499, "LOW"),
        (0.25, "MODERATE"),
        (0.4999, "MODERATE"),
        (0.50, "HIGH"),
        (0.7499, "HIGH"),
        (0.75, "CRITICAL"),
        (1.0, "CRITICAL"),
    ],
)
def test_exact_band_boundaries(score, expected):
    """Bands are lower-inclusive, upper-exclusive, and 1.0 is CRITICAL."""
    assert classify_threat(score) == expected


def test_every_canonical_level_is_reachable():
    produced = {classify_threat(value / 100) for value in range(101)}
    assert produced == set(THREAT_LEVELS)


def test_none_is_unknown_not_low():
    """No data must never be reported as no risk."""
    assert classify_threat(None) == UNKNOWN_THREAT_LEVEL
    assert UNKNOWN_THREAT_LEVEL not in THREAT_LEVELS


@pytest.mark.parametrize("score", [-0.0001, 1.0001, -1.0, 2.0])
def test_out_of_range_score_raises(score):
    with pytest.raises(ValueError, match=r"within \[0, 1\]"):
        classify_threat(score)


@pytest.mark.parametrize("score", ["0.5", True, [0.5], {"score": 0.5}, float("nan")])
def test_non_numeric_score_raises(score):
    with pytest.raises(ValueError):
        classify_threat(score)


def test_nan_is_rejected():
    """NaN fails the range check because every comparison with it is False."""
    with pytest.raises(ValueError):
        classify_threat(math.nan)


def test_integers_are_accepted():
    assert classify_threat(0) == "LOW"
    assert classify_threat(1) == "CRITICAL"


def test_bands_tile_the_unit_interval_without_gaps():
    assert THREAT_BANDS[0].min_score == 0.0
    boundaries = [band.min_score for band in THREAT_BANDS]
    assert boundaries == sorted(boundaries)
    assert len(set(boundaries)) == len(boundaries)


def test_describe_threat_covers_every_level():
    for band in THREAT_BANDS:
        assert describe_threat(band.level) == band.description
    assert describe_threat("NONSENSE") == "Unclassified threat level."
