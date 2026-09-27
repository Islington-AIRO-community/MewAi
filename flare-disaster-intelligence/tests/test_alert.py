"""Alert-decision tests.

The alert stage is deliberately separate from classification, and it must
refuse to publish a warning that was computed from incomplete data.

The non-finite coverage tests are regression tests for an audit finding. The
original implementation gated on ``if coverage < policy.min_coverage_to_alert``,
and because every comparison against ``NaN`` is ``False``, a ``NaN`` coverage
slipped past that gate and reached ``alert=True``. Coverage is now validated
before it is compared.
"""

from __future__ import annotations

import json
from math import inf, nan

import pytest

from risk.alert import AlertDecision, alert_required, decide_alert, validated_coverage
from risk.config import ALERT_POLICY, UNKNOWN_THREAT_LEVEL

FULL = ("antecedent_rainfall", "forecast_rainfall", "discharge_level", "discharge_rise")

#: Values that must never be treated as usable coverage.
UNUSABLE_COVERAGE = [
    pytest.param(nan, id="nan"),
    pytest.param(inf, id="posinf"),
    pytest.param(-inf, id="neginf"),
    pytest.param(True, id="bool_true"),
    pytest.param(False, id="bool_false"),
    pytest.param(None, id="none"),
    pytest.param("abc", id="string"),
    pytest.param(1.5, id="above_one"),
    pytest.param(-0.1, id="below_zero"),
    pytest.param(1j, id="complex"),
    pytest.param(object(), id="object"),
]


def test_high_with_full_coverage_alerts():
    decision = decide_alert("HIGH", coverage=1.0)
    assert decision.alert is True
    assert decision.suppressed is False
    assert decision.requires_manual_verification is False
    assert decision.recommendation == "dispatch_relief_network"
    assert "HIGH" in decision.reason


def test_critical_with_full_coverage_alerts():
    assert decide_alert("CRITICAL", coverage=1.0).alert is True


def test_low_and_moderate_never_alert():
    for level in ("LOW", "MODERATE"):
        decision = decide_alert(level, coverage=1.0)
        assert decision.alert is False
        assert decision.suppressed is False
        assert decision.requires_manual_verification is False


def test_moderate_recommends_monitoring():
    assert decide_alert("MODERATE", coverage=1.0).recommendation == "monitor"


def test_low_recommends_nothing():
    assert decide_alert("LOW", coverage=1.0).recommendation == "none"


def test_qualifying_threat_with_partial_coverage_is_suppressed():
    """The core fail-safe: HIGH threat but 45% coverage must not auto-alert."""
    decision = decide_alert(
        "HIGH",
        coverage=0.45,
        missing_indicators=("discharge_level", "discharge_rise"),
    )
    assert decision.alert is False
    assert decision.suppressed is True
    assert decision.requires_manual_verification is True
    assert decision.recommendation == "verify_before_alerting"
    assert "discharge_level" in decision.reason
    assert "discharge_rise" in decision.reason


def test_coverage_exactly_at_the_policy_minimum_still_alerts():
    """The threshold is inclusive: coverage == min_coverage_to_alert alerts."""
    assert ALERT_POLICY.min_coverage_to_alert == 1.0
    assert decide_alert("HIGH", coverage=1.0).alert is True
    assert decide_alert("HIGH", coverage=0.9999).alert is False


def test_unknown_never_alerts_and_asks_for_data():
    decision = decide_alert(UNKNOWN_THREAT_LEVEL, coverage=0.0)
    assert decision.alert is False
    assert decision.suppressed is False
    assert decision.requires_manual_verification is False
    assert decision.recommendation == "acquire_data"
    assert "no flood indicator" in decision.reason.lower()


def test_alert_required_ignores_coverage_but_rejects_unknown():
    """Legacy helper: level-only check, documented as not coverage-aware."""
    assert alert_required("HIGH") is True
    assert alert_required("CRITICAL") is True
    assert alert_required("LOW") is False
    assert alert_required("MODERATE") is False
    assert alert_required(UNKNOWN_THREAT_LEVEL) is False
    assert alert_required("NOT_A_LEVEL") is False


def test_decision_is_immutable():
    decision = decide_alert("LOW", coverage=1.0)
    with pytest.raises(Exception):
        decision.alert = True  # type: ignore[misc]


def test_decision_serialises_to_the_contract_shape():
    payload = decide_alert("CRITICAL", coverage=1.0).as_dict()
    assert set(payload) == {
        "alert",
        "reason",
        "requires_manual_verification",
        "suppressed",
        "recommendation",
        "details",
    }
    assert payload["alert"] is True
    assert payload["details"]["missing_indicators"] == []


def test_details_report_the_missing_indicators():
    decision = decide_alert(
        "CRITICAL", coverage=0.30, missing_indicators=FULL[1:]
    )
    assert decision.details["missing_indicators"] == list(FULL[1:])
    assert decision.details["coverage"] == 0.3
    assert decision.details["min_coverage_to_alert"] == 1.0


def test_alert_policy_is_configurable_for_future_calibration():
    from dataclasses import replace

    permissive = replace(ALERT_POLICY, min_coverage_to_alert=0.5)
    decision = decide_alert(
        "HIGH", coverage=0.45, missing_indicators=("discharge_level",), policy=permissive
    )
    assert decision.alert is False  # 0.45 is still below 0.5

    relaxed = replace(ALERT_POLICY, min_coverage_to_alert=0.4)
    decision = decide_alert(
        "HIGH", coverage=0.45, missing_indicators=("discharge_level",), policy=relaxed
    )
    assert decision.alert is True
    assert decision.suppressed is False


def test_alert_decision_dataclass_defaults():
    decision = AlertDecision(alert=False, reason="test")
    assert decision.suppressed is False
    assert decision.recommendation == "none"
    assert decision.details == {}


# ---------------------------------------------------------------------------
# Non-finite / invalid coverage must never raise an alert
#
# Regression tests. The previous implementation compared coverage with a bare
# `coverage < policy.min_coverage_to_alert`, so NaN and +inf -- for which every
# comparison is False -- fell straight through to `alert=True`, and None or a
# non-numeric string raised TypeError/ValueError instead of failing safe.
# ---------------------------------------------------------------------------


def test_nan_coverage_cannot_trigger_an_alert():
    """The exact audit finding: NaN must not bypass the coverage gate."""
    decision = decide_alert("CRITICAL", coverage=nan)
    assert decision.alert is False
    assert decision.suppressed is True
    assert decision.requires_manual_verification is True
    assert decision.recommendation == "verify_before_alerting"


def test_positive_infinity_coverage_cannot_trigger_an_alert():
    decision = decide_alert("CRITICAL", coverage=inf)
    assert decision.alert is False
    assert decision.suppressed is True
    assert decision.requires_manual_verification is True


def test_negative_infinity_coverage_cannot_trigger_an_alert():
    decision = decide_alert("CRITICAL", coverage=-inf)
    assert decision.alert is False
    assert decision.suppressed is True
    assert decision.requires_manual_verification is True


@pytest.mark.parametrize("coverage", UNUSABLE_COVERAGE)
@pytest.mark.parametrize("level", ["HIGH", "CRITICAL"])
def test_no_unusable_coverage_value_can_ever_alert(level, coverage):
    """Every unusable value, for every alerting level, must fail safe.

    Guards both the original bypass (NaN, +inf) and the adjacent type and range
    errors that would otherwise crash or misread as full coverage.
    """
    decision = decide_alert(level, coverage=coverage)
    assert decision.alert is False, f"{level} alerted on coverage={coverage!r}"
    assert decision.suppressed is True
    assert decision.requires_manual_verification is True
    assert decision.recommendation == "verify_before_alerting"
    assert decision.details["coverage_valid"] is False


@pytest.mark.parametrize("coverage", UNUSABLE_COVERAGE)
def test_unusable_coverage_does_not_raise(coverage):
    """A malformed value must degrade, not crash the caller."""
    decide_alert("CRITICAL", coverage=coverage)  # must not raise


def test_valid_coverage_still_alerts_after_the_fix():
    """The safety net must not weaken the intended behaviour."""
    for level in ("HIGH", "CRITICAL"):
        decision = decide_alert(level, coverage=1.0)
        assert decision.alert is True
        assert decision.suppressed is False
        assert decision.requires_manual_verification is False
        assert decision.recommendation == "dispatch_relief_network"
        assert decision.details["coverage_valid"] is True


def test_valid_partial_coverage_still_suppresses():
    decision = decide_alert("HIGH", coverage=0.45, missing_indicators=("discharge_level",))
    assert decision.alert is False
    assert decision.suppressed is True
    assert decision.details["coverage_valid"] is True
    assert decision.details["coverage"] == 0.45


def test_numeric_string_coverage_is_accepted_as_a_fraction():
    """A numeric string is a usable fraction, not a malformed value."""
    assert validated_coverage("0.5") == 0.5
    assert decide_alert("HIGH", coverage="0.5").alert is False
    assert decide_alert("HIGH", coverage="1.0").alert is True


@pytest.mark.parametrize("coverage", [0.0, 0.45, 1.0])
def test_validated_coverage_accepts_real_fractions(coverage):
    assert validated_coverage(coverage) == coverage


@pytest.mark.parametrize("coverage", UNUSABLE_COVERAGE)
def test_validated_coverage_rejects_unusable_values(coverage):
    assert validated_coverage(coverage) is None


def test_details_stay_json_serialisable_for_rejected_coverage():
    """An operator-facing payload must never carry a bare NaN."""
    for coverage in (nan, inf, -inf, None, "abc"):
        payload = decide_alert("CRITICAL", coverage=coverage).as_dict()
        assert json.loads(json.dumps(payload, allow_nan=False))["alert"] is False
        assert payload["details"]["coverage_rejected"] == repr(coverage)


def test_unknown_threat_reports_invalid_coverage_without_alerting():
    """UNKNOWN stays the dominant diagnosis, but the bad coverage is recorded."""
    decision = decide_alert(UNKNOWN_THREAT_LEVEL, coverage=nan)
    assert decision.alert is False
    assert decision.recommendation == "acquire_data"
    assert decision.details["coverage_valid"] is False


def test_a_relaxed_policy_still_refuses_nan_coverage():
    """Lowering the threshold must not reopen the NaN bypass."""
    from dataclasses import replace

    permissive = replace(ALERT_POLICY, min_coverage_to_alert=0.0)
    assert permissive.min_coverage_to_alert == 0.0
    assert decide_alert("HIGH", coverage=nan, policy=permissive).alert is False
    assert decide_alert("HIGH", coverage=0.45, policy=permissive).alert is True
