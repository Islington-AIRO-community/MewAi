"""End-to-end orchestration of the FLARE Disaster Intelligence pipeline.

    collection -> validation/processing -> risk -> threat -> alert -> output

One function, :func:`run_flood_pipeline`, is the whole flood path. It is called
identically by the CLI, the HTTP API and the tests, so what a judge sees in the
terminal is what the relief network receives over HTTP.

Failure policy
--------------
External sources are allowed to fail. A source failure is *recorded*, not
raised, and the pipeline continues with whatever data it does have. The result
always states which indicators were missing, how much weight that represents,
and whether the numbers are live or synthetic. Only a fully unusable run (no
indicator at all) produces a threat level of ``UNKNOWN`` with no alert.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Callable

from collectors.base import DataSourceError
from collectors.flood import SOURCE_NAME as FLOOD_SOURCE
from collectors.flood import get_flood
from collectors.weather import SOURCE_NAME as WEATHER_SOURCE
from collectors.weather import get_weather
from processing.flood_features import FloodFeatures, build_flood_features
from risk.alert import decide_alert
from risk.config import UNKNOWN_THREAT_LEVEL, validate_config
from risk.flood import assess_flood_risk
from risk.threat import classify_threat, describe_threat
from schemas.events import (
    FLOOD,
    DataOrigin,
    DataQuality,
    DataSourceStatus,
    IntelligenceEvent,
    Location,
    ThreatAssessment,
    new_event_id,
    utc_now,
)

#: Default per-request timeout for the collectors.
DEFAULT_TIMEOUT = 20.0

#: Short sentence appended to every message so a reader can never mistake this
#: output for an official warning product.
PROTOTYPE_DISCLAIMER = (
    "Prototype rule-based assessment. Thresholds are documented assumptions, "
    "not official Nepal warning levels, and the result is not validated."
)


def run_flood_pipeline(
    location: Location,
    *,
    now: datetime | None = None,
    weather_fetcher: Callable[..., dict[str, Any]] = get_weather,
    flood_fetcher: Callable[..., dict[str, Any]] = get_flood,
    timeout: float = DEFAULT_TIMEOUT,
    data_origin: DataOrigin = "live_api",
    degraded: bool = False,
) -> IntelligenceEvent:
    """Run the full flood intelligence pipeline for one location.

    Parameters
    ----------
    location:
        The point being assessed.
    now:
        Reference time for the observation/forecast split. Injected by tests.
    weather_fetcher, flood_fetcher:
        Collector callables. Injected by tests to supply recorded payloads
        without touching the network.
    timeout:
        Per-request timeout passed to the collectors.
    data_origin:
        Provenance label for the collected numbers. Use ``"synthetic_demo"``
        when the payloads came from the offline fixtures.
    degraded:
        Set by the caller when at least one source failed, so the origin is
        downgraded to ``"partial"`` even if the other source returned data.

    Returns
    -------
    IntelligenceEvent
        Always returned, including on total data loss. Inspect
        ``event.data_quality`` to see what actually happened.
    """
    validate_config()
    reference = now or utc_now()
    statuses: list[DataSourceStatus] = []
    warnings: list[str] = []

    weather_payload = _collect(
        WEATHER_SOURCE,
        lambda: weather_fetcher(
            location.latitude, location.longitude, timeout=timeout
        ),
        statuses,
        warnings,
        data_origin,
    )
    flood_payload = _collect(
        FLOOD_SOURCE,
        lambda: flood_fetcher(
            location.latitude, location.longitude, timeout=timeout
        ),
        statuses,
        warnings,
        data_origin,
    )

    origin = _resolve_origin(data_origin, statuses, degraded)
    if origin == "synthetic_demo":
        warnings.append(
            "These numbers come from labelled offline fixtures, not from a "
            "live API call."
        )
    elif origin == "partial":
        warnings.append("At least one data source failed; see 'sources'.")

    features = build_flood_features(weather_payload, flood_payload, now=reference)
    warnings.extend(features.warnings)

    assessment = assess_flood_risk(features)
    threat_level = classify_threat(assessment.risk_score)
    decision = decide_alert(
        threat_level,
        coverage=assessment.coverage,
        missing_indicators=assessment.missing_indicators,
    )

    event = IntelligenceEvent(
        event_id=new_event_id(FLOOD, reference),
        disaster_type=FLOOD,
        location=location.model_copy(
            update={
                # Any gridded source counts, not just the flood one. Keying this
                # on flood alone reported grid_point=False for a weather-only
                # run even though the weather payload came from a model grid.
                "grid_point": (
                    features.flood_grid is not None or features.weather_grid is not None
                )
            }
        ),
        risk_score=assessment.risk_score,
        assessment=ThreatAssessment(
            threat_level=threat_level,
            alert=decision.alert,
            reason=decision.reason,
            requires_manual_verification=decision.requires_manual_verification,
            suppressed=decision.suppressed,
            recommendation=decision.recommendation,
            missing_indicators=list(assessment.missing_indicators),
        ),
        data_quality=DataQuality(
            coverage=assessment.coverage,
            indicators_used=[i.key for i in assessment.indicators if i.available],
            indicators_missing=list(assessment.missing_indicators),
            origin=origin,
            sources=statuses,
            warnings=warnings,
            is_synthetic=origin == "synthetic_demo",
        ),
        message=build_message(location, threat_level, assessment, features, decision),
        evidence=_build_evidence(features, assessment, threat_level),
        timestamp=reference,
    )
    return event


def _collect(
    name: str,
    fetch: Callable[[], dict[str, Any]],
    statuses: list[DataSourceStatus],
    warnings: list[str],
    run_origin: DataOrigin,
) -> dict[str, Any] | None:
    """Run one collector, recording success or a classified failure.

    ``run_origin`` is stamped onto the successful record so a per-source
    ``origin`` can never contradict the run-level provenance. A synthetic run
    must not leave ``origin="live_api"`` sitting in its own source records.
    """
    try:
        payload = fetch()
    except DataSourceError as exc:
        statuses.append(
            DataSourceStatus(
                name=name,
                status=exc.reason,
                origin="none",
                detail=exc.detail,
            )
        )
        warnings.append(f"{name} unavailable: {exc.reason} ({exc.detail or 'no detail'})")
        return None
    except Exception as exc:  # defensive: a collector bug must not kill the run
        statuses.append(
            DataSourceStatus(
                name=name,
                status="unexpected_error",
                origin="none",
                detail=f"{type(exc).__name__}: {exc}",
            )
        )
        warnings.append(f"{name} raised an unexpected error: {type(exc).__name__}")
        return None

    if not payload:
        # A collector that hands back an empty object has not delivered data.
        # Recording it as "ok" would let a total data loss look like a success.
        statuses.append(
            DataSourceStatus(
                name=name,
                status="empty_payload",
                origin="none",
                detail="collector returned an empty payload",
            )
        )
        warnings.append(f"{name} returned an empty payload; treated as unavailable")
        return None

    statuses.append(
        DataSourceStatus(
            name=name,
            status="ok",
            origin=run_origin,
            records=_count_records(payload),
        )
    )
    return payload


def _count_records(payload: dict[str, Any]) -> int | None:
    """Best-effort count of time steps in a collector payload."""
    for block in ("hourly", "daily"):
        section = payload.get(block)
        if isinstance(section, dict):
            times = section.get("time")
            if isinstance(times, list):
                return len(times)
    return None


def _resolve_origin(
    requested: DataOrigin, statuses: list[DataSourceStatus], degraded: bool
) -> DataOrigin:
    """Work out the honest provenance label for this run."""
    if requested == "synthetic_demo":
        return "synthetic_demo"
    if not statuses or all(s.status != "ok" for s in statuses):
        return "none"
    if degraded or any(s.status != "ok" for s in statuses):
        return "partial"
    return "live_api"


def build_message(
    location: Location,
    threat_level: str,
    assessment: Any,
    features: FloodFeatures,
    decision: Any,
) -> str:
    """Compose the plain-language summary.

    Every number quoted here is read from validated features, so the message
    cannot drift from the evidence block. The wording says "latest readings"
    rather than "observed" because the underlying values are model output on a
    grid, not instrument measurements.
    """
    if threat_level == UNKNOWN_THREAT_LEVEL:
        return (
            f"Flood status for {location.name} could not be determined: no "
            f"usable data was available. {PROTOTYPE_DISCLAIMER}"
        )

    parts: list[str] = []
    if features.rainfall_past_72h_mm is not None:
        parts.append(f"{features.rainfall_past_72h_mm:.0f} mm of rain in the last 72h")
    if features.discharge_latest_m3s is not None:
        discharge = f"river discharge {features.discharge_latest_m3s:.1f} m3/s"
        if features.discharge_baseline_m3s and features.discharge_baseline_m3s > 0:
            ratio = features.discharge_latest_m3s / features.discharge_baseline_m3s
            discharge += f" ({ratio:.1f}x its recent baseline)"
        parts.append(discharge)

    detail = "; ".join(parts) if parts else "no indicator readings available"
    alert_text = (
        "Alert raised."
        if decision.alert
        else f"No alert. {decision.reason}"
    )
    return (
        f"Flood threat {threat_level} for {location.name} "
        f"({describe_threat(threat_level)}). Latest readings: {detail}. "
        f"{alert_text} {PROTOTYPE_DISCLAIMER}"
    )


def _build_evidence(
    features: FloodFeatures, assessment: Any, threat_level: str
) -> dict[str, Any]:
    """Merge measurements and method into one explainability payload."""
    evidence = assessment.as_evidence()
    evidence["measurements"] = features.as_evidence()
    evidence["threat_level"] = threat_level
    evidence["model_grid"] = {
        "weather": features.weather_grid,
        "flood": features.flood_grid,
        "note": (
            "Open-Meteo snaps each request to its nearest model grid cell, so "
            "the returned coordinates differ slightly from the requested point."
        ),
    }
    return evidence
