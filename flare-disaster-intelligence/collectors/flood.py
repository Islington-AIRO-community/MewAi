"""River discharge collector (Open-Meteo Flood API, backed by GloFAS).

Endpoint: ``https://flood-api.open-meteo.com/v1/flood``

Verified live on 2026-09-26 against ``flood-api.open-meteo.com``:

* HTTP 200 for Kathmandu (27.7172, 85.3240) with
  ``daily=river_discharge,river_discharge_mean,river_discharge_max`` and
  ``past_days=7, forecast_days=3``; the response contained 10 aligned daily rows.
* ``hourly=river_discharge`` is **not supported** and returns HTTP 400
  ("Cannot initialize ... from invalid String value river_discharge").
  Discharge is therefore a *daily* quantity in this pipeline. Hourly flood
  analysis is listed as future work rather than faked.
* An out-of-range latitude returns HTTP 400 with a JSON body containing
  ``reason``; :func:`collectors.base.fetch_json` surfaces that text.
* Discharge is reported for the nearest modelled river reach, not for a named
  gauge. Values are not gauge-verified for Nepal.

No values are invented here. If the endpoint is unreachable the collector raises
``DataSourceError`` and the pipeline degrades or fails loudly.
"""

from __future__ import annotations

from typing import Any

import requests

from .base import DEFAULT_TIMEOUT, fetch_json
from .weather import _validate_coordinates

SOURCE_NAME = "open-meteo-flood-glofas"
BASE_URL = "https://flood-api.open-meteo.com/v1/flood"

#: Daily discharge variables requested from the API.
#:
#: * ``river_discharge``      - daily mean discharge of the modelled reach, m3/s
#: * ``river_discharge_mean`` - long-term climatological mean for that day, m3/s
#: * ``river_discharge_max``  - daily maximum discharge, m3/s
DAILY_VARIABLES = (
    "river_discharge",
    "river_discharge_mean",
    "river_discharge_max",
)

#: Past days of discharge to request. This is modelled river discharge for a
#: named reach, not a gauge reading at the requested point.
DEFAULT_PAST_DAYS = 7

#: Forecast days of discharge to request. GloFAS is a medium-range product;
#: three days is the useful horizon for this prototype.
DEFAULT_FORECAST_DAYS = 3


def build_params(
    latitude: float,
    longitude: float,
    *,
    past_days: int = DEFAULT_PAST_DAYS,
    forecast_days: int = DEFAULT_FORECAST_DAYS,
) -> dict[str, Any]:
    """Build the query string for the flood endpoint."""
    _validate_coordinates(latitude, longitude, SOURCE_NAME)
    return {
        "latitude": latitude,
        "longitude": longitude,
        "daily": ",".join(DAILY_VARIABLES),
        "past_days": past_days,
        "forecast_days": forecast_days,
        "timezone": "UTC",
    }


def get_flood(
    latitude: float,
    longitude: float,
    *,
    past_days: int = DEFAULT_PAST_DAYS,
    forecast_days: int = DEFAULT_FORECAST_DAYS,
    timeout: float = DEFAULT_TIMEOUT,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    """Fetch past + forecast river discharge for one coordinate.

    Discharge is modelled for the nearest named reach, not measured at the
    requested point, and the past days are the model's own hindcast.

    Returns the raw decoded JSON payload. Interpretation happens in
    ``processing.flood_features``; this layer only performs I/O.
    """
    params = build_params(
        latitude, longitude, past_days=past_days, forecast_days=forecast_days
    )
    return fetch_json(
        BASE_URL, params, source=SOURCE_NAME, timeout=timeout, session=session
    )
