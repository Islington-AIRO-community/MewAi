"""Loader for the clearly-labelled synthetic demo scenarios.

WHAT THIS IS
------------
Hand-written fixtures that let the flood pipeline run with **no network**, so a
demonstration cannot fail because of a hotel wifi connection. They are also the
controlled inputs used by the unit tests.

WHAT THIS IS NOT
----------------
This is not a data source. Nothing here is an observation. The values were
invented to drive the pipeline into specific, testable states. Any assessment
built from these fixtures is stamped ``origin="synthetic_demo"`` and
``is_synthetic=True`` all the way to the output contract, and the CLI prints a
warning before showing the result.

The fixtures store *offsets* rather than absolute timestamps, so a scenario is
materialised relative to the current time and the past/forecast split stays
meaningful whenever the demo is run.
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from processing.validation import coerce_float, utc_now

#: Location of the scenario file.
SCENARIO_FILE = Path(__file__).with_name("scenarios.json")

#: First hour of the materialised rainfall series, relative to ``now``.
RAINFALL_START_OFFSET_HOURS = -72

#: Number of hourly steps in the materialised rainfall series (past + forecast).
RAINFALL_STEPS = 144

#: First day of the materialised discharge series, relative to today.
DISCHARGE_START_OFFSET_DAYS = -7

#: Number of daily steps in the materialised discharge series.
DISCHARGE_STEPS = 10

#: Scenario used when the caller does not name one.
DEFAULT_SCENARIO = "rising"


class ScenarioNotFound(KeyError):
    """Raised when an unknown scenario name is requested."""


def available_scenarios() -> dict[str, str]:
    """Map of scenario name -> description, for CLI help and the HTTP API."""
    return {
        name: data.get("description", "")
        for name, data in _load_document()["scenarios"].items()
    }


def _load_document() -> dict[str, Any]:
    with SCENARIO_FILE.open(encoding="utf-8") as handle:
        return json.load(handle)


def load_scenario(
    name: str = DEFAULT_SCENARIO, *, now: datetime | None = None
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Materialise a scenario into ``(weather_payload, flood_payload)``.

    The returned dictionaries have the same shape as the real API responses, so
    they can be fed straight into
    :func:`processing.flood_features.build_flood_features`.

    Parameters
    ----------
    name:
        Scenario key from ``scenarios.json``.
    now:
        Reference time. Defaults to the current UTC time.
    """
    scenarios = _load_document()["scenarios"]
    if name not in scenarios:
        raise ScenarioNotFound(
            f"unknown scenario {name!r}; available: {', '.join(sorted(scenarios))}"
        )
    scenario = scenarios[name]
    reference = now or utc_now()
    return (
        _build_weather(scenario, reference),
        _build_flood(scenario, reference),
    )


def _build_weather(scenario: dict[str, Any], now: datetime) -> dict[str, Any]:
    """Expand sparse rainfall offsets into a full hourly series."""
    sparse = {
        int(offset): value
        for offset, value in scenario.get("rainfall_mm_per_hour", [])
    }
    values: list[float | None] = []
    for step in range(RAINFALL_STEPS):
        offset = RAINFALL_START_OFFSET_HOURS + step
        values.append(sparse.get(offset, 0.0))

    truncate_to = scenario.get("truncate_hourly_values_to")
    times = [
        (now + timedelta(hours=RAINFALL_START_OFFSET_HOURS + step)).strftime(
            "%Y-%m-%dT%H:%M"
        )
        for step in range(RAINFALL_STEPS)
    ]
    if isinstance(truncate_to, int):
        # Simulate an upstream series that is shorter than its own time axis.
        values = values[:truncate_to]
        times = times[:truncate_to]

    return {
        "latitude": scenario.get("weather_grid", {}).get("latitude"),
        "longitude": scenario.get("weather_grid", {}).get("longitude"),
        "elevation": scenario.get("weather_grid", {}).get("elevation"),
        "utc_offset_seconds": 0,
        "timezone": "GMT",
        "hourly_units": {
            "time": "iso8601",
            "precipitation": "mm",
            "rain": "mm",
            "precipitation_probability": "%",
        },
        "daily_units": {
            "time": "iso8601",
            "precipitation_sum": "mm",
            "rain_sum": "mm",
            "precipitation_hours": "h",
        },
        "hourly": {
            "time": times,
            "precipitation": values,
            "rain": values,
            "precipitation_probability": [
                80.0 if (coerce_float(v) or 0.0) > 0 else 0.0 for v in values
            ],
        },
        "daily": {"time": [], "precipitation_sum": [], "rain_sum": []},
    }


def _build_flood(scenario: dict[str, Any], now: datetime) -> dict[str, Any]:
    """Expand sparse daily offsets into a full discharge series."""
    if scenario.get("omit_discharge"):
        # A 200 response that simply carries no usable discharge rows, which is
        # what a location far from any modelled river reach looks like.
        return {
            "latitude": scenario.get("flood_grid", {}).get("latitude"),
            "longitude": scenario.get("flood_grid", {}).get("longitude"),
            "elevation": scenario.get("flood_grid", {}).get("elevation"),
            "utc_offset_seconds": 0,
            "timezone": "GMT",
            "daily_units": {
                "time": "iso8601",
                "river_discharge": "m3/s",
                "river_discharge_mean": "m3/s",
                "river_discharge_max": "m3/s",
            },
            "daily": {
                "time": [
                    (now + timedelta(days=DISCHARGE_START_OFFSET_DAYS + step)).strftime(
                        "%Y-%m-%d"
                    )
                    for step in range(DISCHARGE_STEPS)
                ],
                "river_discharge": [None] * DISCHARGE_STEPS,
                "river_discharge_mean": [None] * DISCHARGE_STEPS,
                "river_discharge_max": [None] * DISCHARGE_STEPS,
            },
        }

    rows = {int(row[0]): row[1:] for row in scenario.get("discharge_daily", [])}
    times: list[str] = []
    discharge: list[Any] = []
    mean: list[Any] = []
    maximum: list[Any] = []
    for step in range(DISCHARGE_STEPS):
        offset = DISCHARGE_START_OFFSET_DAYS + step
        times.append(
            (now + timedelta(days=offset)).strftime("%Y-%m-%d")
        )
        row = rows.get(offset, (None, None, None))
        discharge.append(row[0])
        mean.append(row[1])
        maximum.append(row[2])

    daily: dict[str, Any] = {
        "time": times,
        "river_discharge": discharge,
        "river_discharge_mean": mean,
    }
    if not scenario.get("omit_discharge_max"):
        daily["river_discharge_max"] = maximum

    return {
        "latitude": scenario.get("flood_grid", {}).get("latitude"),
        "longitude": scenario.get("flood_grid", {}).get("longitude"),
        "elevation": scenario.get("flood_grid", {}).get("elevation"),
        "utc_offset_seconds": 0,
        "timezone": "GMT",
        "daily_units": {
            "time": "iso8601",
            "river_discharge": "m3/s",
            "river_discharge_mean": "m3/s",
            "river_discharge_max": "m3/s",
        },
        "daily": daily,
    }
