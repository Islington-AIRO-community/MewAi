"""Flood risk assessment.

WHAT THIS IS
------------
A transparent, rule-based, deterministic composite index. It is **not** a
machine-learning model. Nothing here is trained, fitted or validated, and no
accuracy, precision, recall, ROC or loss figure exists for it, because no
Nepal-specific historical flood dataset with verified outcome labels was
available for this milestone.

HOW IT WORKS
------------
1. Four indicators are derived from :class:`processing.flood_features.FloodFeatures`:
   antecedent rainfall, forecast rainfall, discharge level, discharge rise.
2. Each available indicator is min-max normalised into ``[0, 1]`` against the
   prototype bands in :mod:`risk.config`.
3. The risk score is the weighted mean of the available indicators. Weights are
   renormalised over what is actually available, so partial data yields a score
   in the same ``[0, 1]`` range together with an honest ``coverage`` value.
4. The score is handed to :func:`risk.threat.classify_threat`, and the resulting
   threat level plus coverage to :func:`risk.alert.decide_alert`. Those are
   separate modules and separate steps.

Every intermediate value is returned in ``indicators`` so a human can read back
exactly how the score was produced.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from processing.flood_features import FloodFeatures

from .config import (
    CALIBRATION_STATUS,
    DISCHARGE_HIGH_M3S,
    DISCHARGE_LOW_M3S,
    FLOOD_INDICATORS,
    METHOD_NAME,
    METHOD_TYPE,
    METHOD_VERSION,
    MIN_DISCHARGE_BASELINE_M3S,
    RAIN_HIGH_MM,
    RAIN_LOW_MM,
    RISE_RATIO_FULL,
    RISE_RATIO_NEUTRAL,
    indicator_weight_total,
)

#: Number of decimal places used for the published risk score.
RISK_SCORE_PRECISION = 3


def _normalise(value: float, low: float, high: float) -> float:
    """Min-max normalise ``value`` into ``[0, 1]``, clamped at both ends."""
    if high <= low:
        return 0.0
    return max(0.0, min(1.0, (value - low) / (high - low)))


@dataclass(frozen=True)
class IndicatorResult:
    """One indicator's full audit trail."""

    key: str
    label: str
    unit: str
    weight: float
    available: bool
    raw_value: float | None = None
    normalized: float | None = None
    #: ``weight / sum(available weights)``. Equals ``weight`` at full coverage.
    effective_weight: float | None = None
    #: ``effective_weight * normalized``. Sums to the risk score.
    contribution: float | None = None
    note: str = ""

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "unit": self.unit,
            "weight": self.weight,
            "available": self.available,
            "raw_value": self.raw_value,
            "normalized": None if self.normalized is None else round(self.normalized, 3),
            "effective_weight": (
                None
                if self.effective_weight is None
                else round(self.effective_weight, 3)
            ),
            "contribution": (
                None if self.contribution is None else round(self.contribution, 3)
            ),
            "note": self.note,
        }


@dataclass(frozen=True)
class FloodRiskAssessment:
    """Output of the flood risk stage, before classification and alerting."""

    risk_score: float | None
    coverage: float
    indicators: tuple[IndicatorResult, ...]
    warnings: tuple[str, ...] = ()
    method: str = METHOD_NAME
    method_version: str = METHOD_VERSION
    method_type: str = METHOD_TYPE
    calibration_status: str = CALIBRATION_STATUS
    notes: tuple[str, ...] = field(default_factory=tuple)

    @property
    def missing_indicators(self) -> tuple[str, ...]:
        return tuple(i.key for i in self.indicators if not i.available)

    @property
    def has_full_coverage(self) -> bool:
        return abs(self.coverage - 1.0) < 1e-9

    def as_evidence(self) -> dict[str, Any]:
        """The explainability payload embedded in the output contract."""
        return {
            "method": self.method,
            "method_version": self.method_version,
            "method_type": self.method_type,
            "calibration_status": self.calibration_status,
            "is_machine_learning": False,
            "coverage": round(self.coverage, 3),
            "indicators": [indicator.as_dict() for indicator in self.indicators],
            "thresholds": {
                "rainfall_mm": {"low": RAIN_LOW_MM, "high": RAIN_HIGH_MM},
                "discharge_m3s": {
                    "low": DISCHARGE_LOW_M3S,
                    "high": DISCHARGE_HIGH_M3S,
                },
                "discharge_rise_ratio": {
                    "neutral": RISE_RATIO_NEUTRAL,
                    "full": RISE_RATIO_FULL,
                    "min_baseline_m3s": MIN_DISCHARGE_BASELINE_M3S,
                },
            },
            "warnings": list(self.warnings),
            "notes": list(self.notes),
        }


def _antecedent_rainfall(features: FloodFeatures) -> IndicatorResult:
    spec = FLOOD_INDICATORS[0]
    value = features.rainfall_past_72h_mm
    if value is None:
        return IndicatorResult(
            key=spec.key,
            label=spec.label,
            unit=spec.unit,
            weight=spec.weight,
            available=False,
            note="Past 72h rainfall unavailable.",
        )
    if value < 0:
        return IndicatorResult(
            key=spec.key,
            label=spec.label,
            unit=spec.unit,
            weight=spec.weight,
            available=False,
            raw_value=value,
            note="Negative rainfall reading discarded as invalid.",
        )
    return IndicatorResult(
        key=spec.key,
        label=spec.label,
        unit=spec.unit,
        weight=spec.weight,
        available=True,
        raw_value=value,
        normalized=_normalise(value, RAIN_LOW_MM, RAIN_HIGH_MM),
        note=f"Normalised over {RAIN_LOW_MM}-{RAIN_HIGH_MM} mm (prototype band).",
    )


def _forecast_rainfall(features: FloodFeatures) -> IndicatorResult:
    spec = FLOOD_INDICATORS[1]
    value = features.rainfall_forecast_72h_mm
    if value is None:
        return IndicatorResult(
            key=spec.key,
            label=spec.label,
            unit=spec.unit,
            weight=spec.weight,
            available=False,
            note="Forecast 72h rainfall unavailable.",
        )
    if value < 0:
        return IndicatorResult(
            key=spec.key,
            label=spec.label,
            unit=spec.unit,
            weight=spec.weight,
            available=False,
            raw_value=value,
            note="Negative rainfall forecast discarded as invalid.",
        )
    return IndicatorResult(
        key=spec.key,
        label=spec.label,
        unit=spec.unit,
        weight=spec.weight,
        available=True,
        raw_value=value,
        normalized=_normalise(value, RAIN_LOW_MM, RAIN_HIGH_MM),
        note=(
            f"Normalised over {RAIN_LOW_MM}-{RAIN_HIGH_MM} mm (prototype band). "
            "Forecast error grows with lead time; lowest-weighted rainfall term."
        ),
    )


def _discharge_level(features: FloodFeatures) -> IndicatorResult:
    spec = FLOOD_INDICATORS[2]
    value = features.discharge_latest_m3s
    if value is None:
        return IndicatorResult(
            key=spec.key,
            label=spec.label,
            unit=spec.unit,
            weight=spec.weight,
            available=False,
            note="River discharge unavailable for the analysed location.",
        )
    if value < 0:
        return IndicatorResult(
            key=spec.key,
            label=spec.label,
            unit=spec.unit,
            weight=spec.weight,
            available=False,
            raw_value=value,
            note="Negative discharge reading discarded as invalid.",
        )
    return IndicatorResult(
        key=spec.key,
        label=spec.label,
        unit=spec.unit,
        weight=spec.weight,
        available=True,
        raw_value=value,
        normalized=_normalise(value, DISCHARGE_LOW_M3S, DISCHARGE_HIGH_M3S),
        note=(
            f"Normalised over {DISCHARGE_LOW_M3S}-{DISCHARGE_HIGH_M3S} m3/s "
            "(prototype band, not gauge-calibrated)."
        ),
    )


def _discharge_rise(features: FloodFeatures) -> IndicatorResult:
    spec = FLOOD_INDICATORS[3]
    latest = features.discharge_latest_m3s
    baseline = features.discharge_baseline_m3s

    def unavailable(note: str, raw: float | None = None) -> IndicatorResult:
        return IndicatorResult(
            key=spec.key,
            label=spec.label,
            unit=spec.unit,
            weight=spec.weight,
            available=False,
            raw_value=raw,
            note=note,
        )

    if latest is None:
        return unavailable("Latest discharge unavailable, so no rise ratio.")
    if baseline is None:
        return unavailable("No past baseline discharge, so no rise ratio.")
    if baseline < MIN_DISCHARGE_BASELINE_M3S:
        return unavailable(
            f"Baseline discharge {baseline:.2f} m3/s is below "
            f"{MIN_DISCHARGE_BASELINE_M3S} m3/s; a rise ratio would be "
            "meaningless.",
            latest,
        )

    ratio = latest / baseline
    if ratio <= RISE_RATIO_NEUTRAL:
        return IndicatorResult(
            key=spec.key,
            label=spec.label,
            unit=spec.unit,
            weight=spec.weight,
            available=True,
            raw_value=round(ratio, 3),
            normalized=0.0,
            note=(
                f"Discharge is at or below its past baseline "
                f"(ratio {ratio:.2f}x); no rising limb."
            ),
        )

    return IndicatorResult(
        key=spec.key,
        label=spec.label,
        unit=spec.unit,
        weight=spec.weight,
        available=True,
        raw_value=round(ratio, 3),
        normalized=_normalise(ratio, RISE_RATIO_NEUTRAL, RISE_RATIO_FULL),
        note=(
            f"Discharge is {ratio:.2f}x its past baseline; full score at "
            f"{RISE_RATIO_FULL:.1f}x (prototype band)."
        ),
    )


def assess_flood_risk(features: FloodFeatures) -> FloodRiskAssessment:
    """Compute the flood risk score from validated features.

    Parameters
    ----------
    features:
        Validated inputs from :func:`processing.flood_features.build_flood_features`.

    Returns
    -------
    FloodRiskAssessment
        ``risk_score`` is ``None`` only when no indicator could be computed.
        ``coverage`` is always reported so a partial score is never mistaken for
        a complete one.
    """
    results = [
        _antecedent_rainfall(features),
        _forecast_rainfall(features),
        _discharge_level(features),
        _discharge_rise(features),
    ]

    total_weight = indicator_weight_total()
    available_weight = sum(r.weight for r in results if r.available)
    coverage = available_weight / total_weight if total_weight else 0.0

    if available_weight <= 0:
        return FloodRiskAssessment(
            risk_score=None,
            coverage=0.0,
            indicators=tuple(results),
            warnings=features.warnings,
            notes=(
                "No flood indicator could be computed; risk score is undefined.",
            ),
        )

    finalised: list[IndicatorResult] = []
    weighted_sum = 0.0
    for result in results:
        if not result.available:
            finalised.append(result)
            continue
        effective_weight = result.weight / available_weight
        contribution = effective_weight * float(result.normalized or 0.0)
        weighted_sum += contribution
        finalised.append(
            IndicatorResult(
                key=result.key,
                label=result.label,
                unit=result.unit,
                weight=result.weight,
                available=True,
                raw_value=result.raw_value,
                normalized=result.normalized,
                effective_weight=effective_weight,
                contribution=contribution,
                note=result.note,
            )
        )

    notes: list[str] = []
    missing = [r.key for r in finalised if not r.available]
    if missing:
        notes.append(
            "Risk score computed from "
            f"{available_weight:.0%} of total indicator weight; unavailable: "
            f"{', '.join(missing)}. Weights were renormalised over the "
            "indicators that were available."
        )
    if not features.has_full_discharge_history:
        notes.append(
            "The discharge baseline is based on a short past record; the "
            "discharge_rise indicator is correspondingly less reliable."
        )

    return FloodRiskAssessment(
        risk_score=round(weighted_sum, RISK_SCORE_PRECISION),
        coverage=coverage,
        indicators=tuple(finalised),
        warnings=features.warnings,
        notes=tuple(notes),
    )
