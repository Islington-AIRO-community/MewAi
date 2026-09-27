"""Alert decision: threat level + data quality -> alert or no alert.

Separate from :mod:`risk.threat` on purpose. The pipeline is:

    risk score -> threat level -> alert decision -> alert

An alert is published only when **both** conditions hold:

1. the threat level is in :data:`risk.config.ALERT_POLICY.alerting_levels`, and
2. indicator coverage meets
   :data:`risk.config.ALERT_POLICY.min_coverage_to_alert`.

If the threat level qualifies but coverage does not, the alert is *withheld*
and the result is marked ``requires_manual_verification``. This is a deliberate
fail-safe: a HIGH threat computed from a fraction of the indicators is a
hypothesis, not a warning, and the prototype does not have a validated
rainfall-only path to justify publishing it.

Coverage is validated before it is compared (:func:`validated_coverage`).
``NaN``, ``+/-inf``, ``bool``, out-of-range and non-numeric values are all
treated as unusable, because comparisons against ``NaN`` are ``False`` and would
otherwise let a malformed value pass the coverage gate and raise an alert.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import isfinite
from typing import Any

from .config import ALERT_POLICY, UNKNOWN_THREAT_LEVEL


def validated_coverage(coverage: Any) -> float | None:
    """Return ``coverage`` as a usable fraction, or ``None`` if it is not.

    ``coverage`` is the fraction of indicator weight that was available, so a
    usable value is a finite real number in ``[0, 1]``. Anything else is
    rejected:

    * ``NaN`` and ``+/-inf`` are rejected because every comparison against them
      is ``False``, so a bare ``coverage < threshold`` test would let them slip
      past the coverage gate and raise an alert.
    * Values outside ``[0, 1]`` are rejected because they are not a fraction.
    * ``bool`` is rejected even though it is an ``int`` subclass, so that a
      stray truth value cannot be read as "complete coverage".
    * Anything that is not a real number is rejected instead of raising, so a
      malformed value degrades to the fail-safe outcome rather than crashing a
      caller such as a future agent or API layer.

    Returns
    -------
    float or None
        The validated fraction, or ``None`` when the input is unusable.
    """
    if isinstance(coverage, bool):
        return None
    try:
        value = float(coverage)
    except (TypeError, ValueError):
        return None
    if not isfinite(value):
        return None
    if not 0.0 <= value <= 1.0:
        return None
    return value



@dataclass(frozen=True)
class AlertDecision:
    """The outcome of the alert stage."""

    alert: bool
    #: Free-text reason for the decision, safe to show to an operator.
    reason: str
    #: True when a qualifying threat level was withheld for manual review.
    requires_manual_verification: bool = False
    #: True when the threat level qualified but data was insufficient.
    suppressed: bool = False
    #: Operator-facing recommendation, e.g. "monitor" or "dispatch".
    recommendation: str = "none"
    #: Extra machine-readable context.
    details: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "alert": self.alert,
            "reason": self.reason,
            "requires_manual_verification": self.requires_manual_verification,
            "suppressed": self.suppressed,
            "recommendation": self.recommendation,
            "details": dict(self.details),
        }


def alert_required(threat_level: str) -> bool:
    """True when ``threat_level`` is on its own enough to warrant an alert.

    This is the simple level-only check kept from the original prototype. It
    ignores data quality, so operational code should call :func:`decide_alert`
    instead. ``UNKNOWN`` never qualifies.
    """
    if threat_level == UNKNOWN_THREAT_LEVEL:
        return False
    return threat_level in ALERT_POLICY.alerting_levels


def decide_alert(
    threat_level: str,
    *,
    coverage: float,
    missing_indicators: tuple[str, ...] = (),
    policy=ALERT_POLICY,
) -> AlertDecision:
    """Decide whether to publish an alert.

    Parameters
    ----------
    threat_level:
        Output of :func:`risk.threat.classify_threat`.
    coverage:
        Fraction of total indicator weight that was actually available, in
        ``[0, 1]``. ``1.0`` means every indicator contributed. The value is
        validated by :func:`validated_coverage`; ``NaN``, ``+/-inf``, ``bool``,
        out-of-range and non-numeric values are treated as unusable and can never
        produce an alert.
    missing_indicators:
        Keys of the indicators that were unavailable, for the operator message.
    policy:
        Alerting policy; injectable for tests.
    """
    usable_coverage = validated_coverage(coverage)
    coverage_is_usable = usable_coverage is not None

    # Reported coverage falls back to 0.0 so the details block stays JSON-safe
    # even when the caller passed something unprintable as a number.
    reported_coverage = round(usable_coverage, 3) if coverage_is_usable else 0.0

    details: dict[str, Any] = {
        "threat_level": threat_level,
        "coverage": reported_coverage,
        "coverage_valid": coverage_is_usable,
        "missing_indicators": list(missing_indicators),
        "min_coverage_to_alert": policy.min_coverage_to_alert,
    }
    if not coverage_is_usable:
        details["coverage_rejected"] = repr(coverage)

    if threat_level == UNKNOWN_THREAT_LEVEL:
        return AlertDecision(
            alert=False,
            reason=(
                "Threat level is UNKNOWN because no flood indicator could be "
                "computed. No alert is issued on missing data."
            ),
            recommendation="acquire_data",
            details=details,
        )

    if threat_level not in policy.alerting_levels:
        advisory = threat_level in policy.advisory_levels
        return AlertDecision(
            alert=False,
            reason=(
                f"Threat level {threat_level} is below the alerting threshold "
                f"({'/'.join(sorted(policy.alerting_levels))})."
                + (" Monitor conditions." if advisory else " No action required.")
            ),
            recommendation="monitor" if advisory else "none",
            details=details,
        )

    # Fail-safe: a qualifying threat level with unusable coverage is withheld,
    # never alerted. This must come before the numeric comparison below, because
    # `NaN < x` is False and would otherwise fall straight through to alert=True.
    if not coverage_is_usable:
        return AlertDecision(
            alert=False,
            reason=(
                f"Threat level {threat_level} qualifies for an alert, but the "
                f"reported coverage {coverage!r} is not a valid fraction in "
                f"[0, 1]. Alert withheld pending manual verification."
            ),
            requires_manual_verification=True,
            suppressed=True,
            recommendation="verify_before_alerting",
            details=details,
        )

    assert usable_coverage is not None  # narrowed by the check above
    if usable_coverage < policy.min_coverage_to_alert:
        missing = ", ".join(missing_indicators) or "unknown indicators"
        return AlertDecision(
            alert=False,
            reason=(
                f"Threat level {threat_level} qualifies for an alert, but only "
                f"{usable_coverage:.0%} of the indicator weight was available "
                f"(missing: {missing}). Alert withheld pending manual "
                "verification."
            ),
            requires_manual_verification=True,
            suppressed=True,
            recommendation="verify_before_alerting",
            details=details,
        )

    return AlertDecision(
        alert=True,
        reason=(
            f"Threat level {threat_level} is at or above the alerting threshold "
            f"with full indicator coverage ({usable_coverage:.0%})."
        ),
        recommendation="dispatch_relief_network",
        details=details,
    )
