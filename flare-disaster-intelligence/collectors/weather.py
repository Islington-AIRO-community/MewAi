"""Weather and rainfall collector (Open-Meteo Forecast API).

Endpoint: ``https://api.open-meteo.com/v1/forecast``

Verified live on 2026-09-26 against ``api.open-meteo.com``:

* HTTP 200 for Kathmandu (27.7172, 85.3240) with ``past_days=7, forecast_days=7``.
* The response carries both an ``hourly`` block (336 entries) and a ``daily``
  block (14 entries) when both are requested in the same call.
* ``utc_offset_seconds`` is ``0`` and ``timezone`` echoes ``GMT`` because the
  collector always requests ``timezone=UTC``.

No values are invented here. If the endpoint is unreachable the collector raises
``DataSourceError`` and the pipeline degrades or fails loudly.
"""

from __future__ import annotations

from typing import Any

import requests

from .base import DEFAULT_TIMEOUT, DataSourceError, FailureReason, fetch_json

SOURCE_NAME = "open-meteo-weather"
BASE_URL = "https://api.open-meteo.com/v1/forecast"

#: Hourly variables requested from the API.
HOURLY_VARIABLES = (
    "precipitation",  # total precipitation, mm
    "rain",  # rain only, mm
    "precipitation_probability",  # %
)

#: Daily variables requested from the API.
DAILY_VARIABLES = (
    "precipitation_sum",  # mm per day
    "rain_sum",  # mm per day
    "precipitation_hours",  # hours of precipitation per day
)

#: Past days of weather to request. These are the model's own output for
#: elapsed hours (a hindcast), NOT station or radar observations. Seven days
#: gives the risk engine a real antecedent-rainfall window instead of
#: forecast-only data.
DEFAULT_PAST_DAYS = 7

#: Forecast days to request. The flood risk prototype looks 3 days ahead.
DEFAULT_FORECAST_DAYS = 7


def build_params(
    latitude: float,
    longitude: float,
    *,
    past_days: int = DEFAULT_PAST_DAYS,
    forecast_days: int = DEFAULT_FORECAST_DAYS,
) -> dict[str, Any]:
    """Build the query string for the weather endpoint."""
    _validate_coordinates(latitude, longitude, SOURCE_NAME)
    return {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(HOURLY_VARIABLES),
        "daily": ",".join(DAILY_VARIABLES),
        "past_days": past_days,
        "forecast_days": forecast_days,
        "timezone": "UTC",
    }


def get_weather(
    latitude: float,
    longitude: float,
    *,
    past_days: int = DEFAULT_PAST_DAYS,
    forecast_days: int = DEFAULT_FORECAST_DAYS,
    timeout: float = DEFAULT_TIMEOUT,
    session: requests.Session | None = None,
) -> dict[str, Any]:
    """Fetch past + forecast rainfall for one coordinate.

    Both halves are numerical model output from the nearest grid cell. The past
    part is the model's hindcast for elapsed hours, not a station or radar
    observation.

    Returns the raw decoded JSON payload. Interpretation happens in
    ``processing.flood_features``; this layer only performs I/O.
    """
    params = build_params(
        latitude, longitude, past_days=past_days, forecast_days=forecast_days
    )
    return fetch_json(
        BASE_URL, params, source=SOURCE_NAME, timeout=timeout, session=session
    )


def _validate_coordinates(latitude: float, longitude: float, source: str) -> None:
    """Reject out-of-range coordinates locally.

    The API also rejects them (HTTP 400), but failing here gives a clearer
    message and avoids a pointless network round trip.
    """
    if not -90.0 <= float(latitude) <= 90.0:
        raise DataSourceError(
            source,
            FailureReason.INVALID_REQUEST,
            f"latitude must be between -90 and 90, got {latitude}",
        )
    if not -180.0 <= float(longitude) <= 180.0:
        raise DataSourceError(
            source,
            FailureReason.INVALID_REQUEST,
            f"longitude must be between -180 and 180, got {longitude}",
        )
