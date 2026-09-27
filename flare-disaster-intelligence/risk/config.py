"""Centralised configuration for the FLARE flood threat model.

Every threshold, weight and band used anywhere in the flood pipeline is declared
here and nowhere else. Changing a number in this file changes the behaviour of
the whole system; no threshold is hard-coded inside a scoring function.

    !!  READ THIS BEFORE QUOTING ANY NUMBER IN THIS FILE  !!

Every value in this module is a **PROTOTYPE ASSUMPTION**.

They are *not*:

* official Nepal disaster-warning thresholds,
* thresholds issued by the National Disaster Risk Reduction and Management
  Authority (NDRRMA), the Department of Hydrology and Meteorology (DHM), or
  any other agency,
* calibrated against Nepali river-gauge records, and
* validated against any observed flood outcome.

They exist so that the pipeline is runnable, testable and explainable end to end
before real calibration data is available. The method is a **rule-based,
deterministic, transparent composite index**. It is not a machine-learning
model, it is not trained, and it has no accuracy, precision, recall or
validation metrics, because none were measured.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# --------------------------------------------------------------------------
# Method metadata
# --------------------------------------------------------------------------

METHOD_NAME = "FLARE Flood Risk Engine"
METHOD_VERSION = "0.2.0-prototype"
METHOD_TYPE = "rule_based_deterministic_composite_index"
METHOD_DESCRIPTION = (
    "Weighted sum of four normalised hazard indicators: antecedent rainfall, "
    "forecast rainfall, river discharge level, and river discharge rise. "
    "Indicators that are unavailable are dropped and the remaining weights are "
    "renormalised, so the score is always reported with its coverage."
)
CALIBRATION_STATUS = (
    "PROTOTYPE ASSUMPTIONS - not Nepal-calibrated, not derived from official "
    "warning thresholds, not validated against observed flood outcomes."
)
IS_MACHINE_LEARNING = False


# --------------------------------------------------------------------------
# Threat levels
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class ThreatBand:
    """One band of the risk-score -> threat-level mapping."""

    level: str
    min_score: float
    description: str


#: Ordered, contiguous bands over the closed interval [0, 1]. The last band is
#: open-ended so any score <= 1.0 is classified.
#:
#: PROTOTYPE ASSUMPTION: the cut points 0.25 / 0.50 / 0.75 divide the score
#: range into equal quarters. They are not derived from impact data.
THREAT_BANDS: tuple[ThreatBand, ...] = (
    ThreatBand("LOW", 0.00, "Normal conditions for the analysed location."),
    ThreatBand("MODERATE", 0.25, "Elevated conditions; worth monitoring."),
    ThreatBand("HIGH", 0.50, "High hazard indication; alerting is enabled."),
    ThreatBand("CRITICAL", 0.75, "Very high hazard indication; alerting is enabled."),
)

#: Emitted instead of LOW/MODERATE/HIGH/CRITICAL when not a single indicator
#: could be computed, so that "no data" is never displayed as "no risk".
UNKNOWN_THREAT_LEVEL = "UNKNOWN"

#: The four canonical threat levels, in increasing severity.
THREAT_LEVELS: tuple[str, ...] = (
    "LOW",
    "MODERATE",
    "HIGH",
    "CRITICAL",
)


# --------------------------------------------------------------------------
# Alerting policy
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class AlertPolicy:
    """When a threat level is allowed to become a published alert."""

    #: Threat levels that may raise an alert.
    alerting_levels: frozenset[str]
    #: Minimum fraction of total indicator weight that must be present before an
    #: alert may be published. Below this the system refuses to alert and asks
    #: for human verification instead.
    min_coverage_to_alert: float
    #: Threat levels that produce a "monitor" recommendation with no alert.
    advisory_levels: frozenset[str]


#: PROTOTYPE ASSUMPTION. A flood alert is only published when the full set of
#: indicators was available (``min_coverage_to_alert = 1.0``). Rationale: the
#: rainfall-only path is the least defensible part of this prototype, so a
#: partial-data result is escalated for human verification rather than sent
#: out as a warning.
ALERT_POLICY = AlertPolicy(
    alerting_levels=frozenset({"HIGH", "CRITICAL"}),
    min_coverage_to_alert=1.0,
    advisory_levels=frozenset({"MODERATE"}),
)


# --------------------------------------------------------------------------
# Flood indicator definitions
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Indicator:
    """One normalised hazard indicator.

    Parameters
    ----------
    key:
        Stable identifier, also used in the output evidence.
    label:
        Human-readable name for the evidence block and the demo printout.
    unit:
        Physical unit of the underlying measurement.
    weight:
        Share of the total risk score contributed when the indicator is present.
        All weights must sum to 1.0; :func:`validate_config` enforces this.
    """

    key: str
    label: str
    unit: str
    weight: float


#: The four indicators, in the order they appear in the evidence block.
#:
#: PROTOTYPE ASSUMPTION: the weights encode the general hydrological judgement
#: that river response is driven mostly by antecedent rainfall and current river
#: state, and that pure forecast rainfall is the weakest single predictor
#: because forecast error grows with lead time. They are not fitted to data.
FLOOD_INDICATORS: tuple[Indicator, ...] = (
    Indicator(
        key="antecedent_rainfall",
        label="Antecedent rainfall (past 72h, model-derived)",
        unit="mm",
        weight=0.30,
    ),
    Indicator(
        key="forecast_rainfall",
        label="Forecast rainfall (next 72h)",
        unit="mm",
        weight=0.15,
    ),
    Indicator(
        key="discharge_level",
        label="River discharge level",
        unit="m3/s",
        weight=0.35,
    ),
    Indicator(
        key="discharge_rise",
        label="River discharge rise vs. past baseline",
        unit="ratio",
        weight=0.20,
    ),
)

#: PROTOTYPE ASSUMPTION. The two rainfall indicators share one band pair. A
#: 72-hour total of RAIN_LOW_MM is treated as no flood-forcing rainfall and
#: RAIN_HIGH_MM as severe. These are round numbers chosen for legibility in a
#: demo, not derived from Nepal flood case studies.
RAIN_LOW_MM = 20.0
RAIN_HIGH_MM = 120.0

#: PROTOTYPE ASSUMPTION. Absolute discharge band for the ``discharge_level``
#: indicator, in m3/s (GloFAS daily mean discharge for the modelled reach).
#:
#: These are order-of-magnitude bands spanning the range this API returns for
#: Nepali river reaches, chosen so the score uses the full 0-1 range. They are
#: NOT gauge-calibrated and NOT official flood thresholds. A future milestone
#: must replace them with per-basin rating-curve levels.
DISCHARGE_LOW_M3S = 30.0
DISCHARGE_HIGH_M3S = 400.0

#: PROTOTYPE ASSUMPTION. The ``discharge_rise`` indicator is
#: ``latest / baseline``. A ratio of RISE_RATIO_NEUTRAL (1.0) contributes
#: nothing; RISE_RATIO_FULL (4.0) or more contributes the full 1.0. The
#: baseline is the mean modelled discharge of the preceding days.
RISE_RATIO_NEUTRAL = 1.0
RISE_RATIO_FULL = 4.0

#: Smallest baseline discharge (m3/s) that is meaningful to divide by. Below
#: this the rise ratio is treated as unavailable rather than computed from a
#: near-zero denominator.
MIN_DISCHARGE_BASELINE_M3S = 1.0


def indicator_weight_total() -> float:
    """Sum of all indicator weights (1.0 for the shipped configuration)."""
    return sum(indicator.weight for indicator in FLOOD_INDICATORS)


def _classify_with_bands(score: float, bands: tuple[ThreatBand, ...]) -> str:
    """Mirror :func:`risk.threat.classify_threat`'s lookup for an explicit band set.

    ``risk.threat`` imports this module, so importing it back here would be
    circular. The rule is "last band whose ``min_score`` the score reaches",
    which means each band's implied range is ``[min_score, next min_score)``
    with the final band open-ended at 1.0. ``tests/test_config.py`` asserts
    this mirror stays in step with the real classifier.
    """
    level = bands[0].level
    for band in bands:
        if score >= band.min_score:
            level = band.level
    return level


def threat_band_gaps(bands: tuple[ThreatBand, ...] | None = None) -> list[str]:
    """Return bands whose documented range is empty, uneven, or misclassified.

    A band ``i`` owns ``[min_score, next min_score)``; the last band owns
    ``[min_score, 1.0]``. Because every upper bound is *derived* from the next
    band, a band range can never be skipped over, so these three checks are what
    makes "the bands tile ``[0, 1]``" a real guarantee rather than an assertion:

    * an **empty** range -- notably a final band pinned to ``1.0``, which leaves
      ``CRITICAL`` reachable only at the single point ``1.0`` while everything
      below it reports ``HIGH``;
    * an **uneven** range -- the bands are documented as equal quarters, so
      boundaries such as ``0.00 / 0.25 / 0.60 / 0.75`` (widths
      ``0.25 / 0.35 / 0.15 / 0.25``) are rejected. Such a config still assigns
      every score, but it silently contradicts the published band table, and the
      strict-increase check cannot see that.
    * a midpoint of its own range classified as some **other** level.
    """
    bands = THREAT_BANDS if bands is None else bands
    upper_bounds = [band.min_score for band in bands[1:]] + [1.0]
    widths = [upper - band.min_score for band, upper in zip(bands, upper_bounds)]
    first_width = widths[0] if widths else 0.0

    gaps: list[str] = []
    for band, upper, width in zip(bands, upper_bounds, widths):
        if width <= 0.0:
            # Degenerate / zero-width band: owns no score at all.
            gaps.append(band.level)
            continue
        if abs(width - first_width) > 1e-9:
            # Internal gap or overlap in disguise: this band does not have the
            # width the documented equal-quarter table promises.
            gaps.append(band.level)
            continue
        midpoint = (band.min_score + upper) / 2.0
        if _classify_with_bands(midpoint, bands) != band.level:
            gaps.append(band.level)
    return gaps


def validate_config() -> None:
    """Fail fast if the configuration is internally inconsistent.

    Raises
    ------
    ValueError
        If weights do not sum to 1.0, a band is degenerate, a band range is
        inverted, the threat bands are not the expected levels in order, or the
        threat bands do not actually tile ``[0, 1]`` at runtime.
    """
    total = indicator_weight_total()
    if abs(total - 1.0) > 1e-9:
        raise ValueError(f"flood indicator weights must sum to 1.0, got {total!r}")

    keys = [indicator.key for indicator in FLOOD_INDICATORS]
    if len(keys) != len(set(keys)):
        raise ValueError("flood indicator keys must be unique")

    if RAIN_HIGH_MM <= RAIN_LOW_MM:
        raise ValueError("RAIN_HIGH_MM must be greater than RAIN_LOW_MM")
    if DISCHARGE_HIGH_M3S <= DISCHARGE_LOW_M3S:
        raise ValueError(
            "DISCHARGE_HIGH_M3S must be greater than DISCHARGE_LOW_M3S"
        )
    if RISE_RATIO_FULL <= RISE_RATIO_NEUTRAL:
        raise ValueError("RISE_RATIO_FULL must be greater than RISE_RATIO_NEUTRAL")

    expected_levels = list(THREAT_LEVELS)
    actual_levels = [band.level for band in THREAT_BANDS]
    if actual_levels != expected_levels:
        raise ValueError(
            f"THREAT_BANDS must be exactly {expected_levels} in order, "
            f"got {actual_levels}"
        )
    if THREAT_BANDS[0].min_score != 0.0:
        raise ValueError("the first threat band must start at 0.0")
    for previous, band in zip(THREAT_BANDS, THREAT_BANDS[1:]):
        if band.min_score <= previous.min_score:
            raise ValueError("threat band boundaries must strictly increase")

    gaps = threat_band_gaps(THREAT_BANDS)
    if gaps:
        raise ValueError(
            f"threat bands must tile [0, 1] contiguously; {gaps} are never "
            "produced by their own documented range (a band pinned to 1.0 is "
            "the usual cause)"
        )


def threat_band_bounds() -> list[dict[str, Any]]:
    """Return each band's real half-open ``[min, max)`` range, 1.0 inclusive.

    ``classify_threat`` derives every upper bound from the next band's
    ``min_score``, with the final band closing at 1.0. Publishing the resolved
    bounds keeps the documented ranges verifiable instead of implied.
    """
    upper_bounds = [band.min_score for band in THREAT_BANDS[1:]] + [1.0]
    return [
        {
            "level": band.level,
            "min_risk_score": band.min_score,
            "max_risk_score": upper,
            "max_inclusive": band is THREAT_BANDS[-1],
            "description": band.description,
        }
        for band, upper in zip(THREAT_BANDS, upper_bounds)
    ]


def describe_thresholds() -> dict[str, Any]:
    """Machine-readable dump of every threshold, for docs and the HTTP API."""
    return {
        "method": {
            "name": METHOD_NAME,
            "version": METHOD_VERSION,
            "type": METHOD_TYPE,
            "description": METHOD_DESCRIPTION,
            "calibration_status": CALIBRATION_STATUS,
            "is_machine_learning": IS_MACHINE_LEARNING,
        },
        "indicators": [
            {"key": i.key, "label": i.label, "unit": i.unit, "weight": i.weight}
            for i in FLOOD_INDICATORS
        ],
        "bands": {
            "rainfall_mm": {"low": RAIN_LOW_MM, "high": RAIN_HIGH_MM},
            "discharge_m3s": {"low": DISCHARGE_LOW_M3S, "high": DISCHARGE_HIGH_M3S},
            "discharge_rise_ratio": {
                "neutral": RISE_RATIO_NEUTRAL,
                "full": RISE_RATIO_FULL,
                "min_baseline_m3s": MIN_DISCHARGE_BASELINE_M3S,
            },
        },
        "threat_levels": threat_band_bounds(),
        "unknown_threat_level": UNKNOWN_THREAT_LEVEL,
        "alert_policy": {
            "alerting_levels": sorted(ALERT_POLICY.alerting_levels),
            "advisory_levels": sorted(ALERT_POLICY.advisory_levels),
            "min_coverage_to_alert": ALERT_POLICY.min_coverage_to_alert,
        },
    }
