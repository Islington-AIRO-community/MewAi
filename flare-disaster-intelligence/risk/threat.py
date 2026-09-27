"""Threat classification: risk score -> LOW / MODERATE / HIGH / CRITICAL.

This module is deliberately tiny and contains no scoring logic. It reads its
boundaries from :mod:`risk.config` so that there is exactly one place where the
risk-score scale is defined.

Alerting lives in :mod:`risk.alert`, not here. Classification answers "how severe
is this?", alerting answers "should anyone be told?" — two different questions.
"""

from __future__ import annotations

from .config import THREAT_BANDS, UNKNOWN_THREAT_LEVEL

# Re-exported for backwards compatibility with the original prototype, which
# exposed ``risk.threat.alert_required``. The implementation now lives in
# ``risk.alert`` so that the alert decision is a separate, testable stage.
from .alert import alert_required  # noqa: F401  (re-export)


def classify_threat(risk_score: float | None) -> str:
    """Map a risk score in ``[0, 1]`` to a threat level.

    Parameters
    ----------
    risk_score:
        A score produced by :func:`risk.flood.assess_flood_risk`.

    Returns
    -------
    str
        One of ``"LOW"``, ``"MODERATE"``, ``"HIGH"``, ``"CRITICAL"``, or
        ``"UNKNOWN"``.

        ``"UNKNOWN"`` is returned when ``risk_score`` is ``None``, which the
        risk engine produces only when *no* indicator could be computed. It
        exists so that "we have no data" is never rendered as "there is no
        risk"; :mod:`risk.alert` never alerts on ``"UNKNOWN"``.

    Raises
    ------
    ValueError
        If ``risk_score`` is not a real number or falls outside ``[0, 1]``.
    """
    if risk_score is None:
        return UNKNOWN_THREAT_LEVEL
    if isinstance(risk_score, bool) or not isinstance(risk_score, (int, float)):
        raise ValueError(f"risk_score must be a number or None, got {risk_score!r}")
    if not 0.0 <= float(risk_score) <= 1.0:
        raise ValueError(f"risk_score must be within [0, 1], got {risk_score!r}")

    score = float(risk_score)
    level = THREAT_BANDS[0].level
    for band in THREAT_BANDS:
        if score >= band.min_score:
            level = band.level
    return level


def describe_threat(level: str) -> str:
    """Return the human-readable description for a threat level."""
    for band in THREAT_BANDS:
        if band.level == level:
            return band.description
    return "Unclassified threat level."
