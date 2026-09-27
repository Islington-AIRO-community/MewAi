"""HTTP/JSON interface for the FLARE Disaster Intelligence Layer.

This is the integration seam with the Post-Disaster Relief Network. The relief
team only needs the documented endpoints below; nothing here imports or depends
on their frontend or backend.

Endpoints
---------
``GET /health``
    Liveness probe. Does not touch the network.
``GET /v1/thresholds``
    Every threshold, weight and band used by the risk engine, with the
    calibration status attached. Lets a reviewer check our assumptions without
    reading the source.
``GET /v1/locations``
    The demo locations this prototype can assess.
``GET /v1/scenarios``
    The synthetic demo scenarios, clearly labelled as non-live.
``GET /v1/flood``
    Assess a location using the **live** Open-Meteo APIs.
    Query: ``location``, ``fallback_synthetic`` (default ``true``).
``GET /v1/flood/offline``
    Assess a location using a **synthetic** scenario. Never touches the network.
    Query: ``location``, ``scenario``.
``GET /v1/contract``
    The output-contract shape, so the consuming team can generate a client.
``GET /demo/earthquake``
    The original prototype earthquake path, unchanged in scope.

Failure behaviour
-----------------
A failing upstream source is *not* an HTTP error. The pipeline records it and
returns a normal assessment whose ``data_quality.sources`` shows the failure and
whose ``assessment.reason`` explains the consequence. This is deliberate: a 502
would tell the relief network nothing about whether there is a flood.

Only genuinely unusable *requests* produce 4xx: an unknown location or an
unknown scenario name.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Query

from demo.fixtures import DEFAULT_SCENARIO, available_scenarios
from main import (
    DEMO_LOCATIONS,
    describe_source_failures,
    live_collection_is_unusable,
    run_earthquake_demo,
    run_flood_live,
    run_flood_offline,
    run_flood_with_fallback,
)
from risk.config import CALIBRATION_STATUS, describe_thresholds
from schemas.events import CONTRACT_VERSION, IntelligenceEvent

app = FastAPI(
    title="FLARE Disaster Intelligence API",
    version="0.2.0",
    description=(
        "Flood intelligence pipeline for the FLARE Disaster Intelligence Layer. "
        "Rule-based prototype; see /v1/thresholds for the assumptions."
    ),
)


def _location_or_404(name: str):
    location = DEMO_LOCATIONS.get(name)
    if location is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"unknown location {name!r}; available: "
                f"{', '.join(sorted(DEMO_LOCATIONS))}"
            ),
        )
    return location


@app.get("/health")
def health() -> dict[str, Any]:
    """Liveness probe. Performs no network calls."""
    return {
        "status": "ok",
        "service": "flare-disaster-intelligence",
        "contract_version": CONTRACT_VERSION,
        "milestone": "1 - foundation + flood intelligence",
    }


@app.get("/v1/thresholds")
def thresholds() -> dict[str, Any]:
    """Every threshold, weight and band, plus the calibration status."""
    payload = describe_thresholds()
    payload["calibration_status"] = CALIBRATION_STATUS
    payload["disclaimer"] = (
        "These are documented prototype assumptions. They are not official "
        "Nepal disaster-warning thresholds."
    )
    return payload


@app.get("/v1/locations")
def locations() -> dict[str, Any]:
    """Locations this prototype can assess."""
    return {
        "locations": [
            {
                "key": key,
                "name": place.name,
                "latitude": place.latitude,
                "longitude": place.longitude,
            }
            for key, place in DEMO_LOCATIONS.items()
        ]
    }


@app.get("/v1/scenarios")
def scenarios() -> dict[str, Any]:
    """Synthetic demo scenarios. Explicitly not live data."""
    return {
        "warning": (
            "SYNTHETIC DEMO DATA. These scenarios are hand-written fixtures, "
            "not observations. Results built from them are tagged "
            "data_quality.origin='synthetic_demo'."
        ),
        "default": DEFAULT_SCENARIO,
        "scenarios": available_scenarios(),
    }


@app.get("/v1/contract")
def contract() -> dict[str, Any]:
    """JSON Schema of the output contract, for client generation."""
    return IntelligenceEvent.model_json_schema()


@app.get("/v1/flood")
def flood(
    location: str = Query("kathmandu", description="Location key"),
    fallback_synthetic: bool = Query(
        True,
        description=(
            "If the live APIs fail, fall back to a synthetic scenario. The "
            "result is labelled synthetic_demo so it cannot be mistaken for "
            "live data. Set false to fail loudly instead."
        ),
    ),
) -> dict[str, Any]:
    """Assess flood risk for a location using the live public APIs."""
    place = _location_or_404(location)
    if fallback_synthetic:
        event = run_flood_with_fallback(place)
    else:
        event = run_flood_live(place)
        # The pipeline records source failures instead of raising, so the failed
        # live attempt has to be detected from the returned result.
        if live_collection_is_unusable(event):
            raise HTTPException(
                status_code=503,
                detail=(
                    "Live data collection produced no usable data and fallback "
                    f"is disabled: {describe_source_failures(event)}"
                ),
            )
    return event.to_dict()


@app.get("/v1/flood/offline")
def flood_offline(
    location: str = Query("kathmandu", description="Location key"),
    scenario: str = Query(DEFAULT_SCENARIO, description="Synthetic scenario name"),
) -> dict[str, Any]:
    """Assess flood risk with no network, using a synthetic scenario."""
    place = _location_or_404(location)
    try:
        event = run_flood_offline(place, scenario)
    except KeyError as exc:
        raise HTTPException(
            status_code=404,
            detail=(
                f"unknown scenario {scenario!r}; available: "
                f"{', '.join(sorted(available_scenarios()))}"
            ),
        ) from exc
    return event.to_dict()


@app.get("/demo/earthquake")
def demo_earthquake() -> dict[str, Any]:
    """Original prototype earthquake path. Not expanded in this milestone."""
    try:
        return run_earthquake_demo()
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller as 502
        raise HTTPException(
            status_code=502, detail=f"Earthquake data pipeline failed: {exc}"
        ) from exc
