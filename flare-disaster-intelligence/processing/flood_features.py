"""Reduce raw weather + flood API payloads to validated flood features.

This is the "Data Validation" and "Data Processing" stage of the pipeline. It
does two things and nothing else:

1. Aligns each series to its own time axis and discards unreadable values,
   recording a warning for every problem it finds.
2. Reduces the payloads to the named features the flood risk engine consumes.

Time-window definitions (all UTC, relative to an injected ``now``). Every
rainfall window is **half-open**, lower bound inclusive and upper bound
exclusive, so with hourly samples each one holds exactly its stated number of
hours:

``rainfall_past_24h_mm``
    Sum of hourly ``precipitation`` over ``[now - 24h, now)`` -- 24 samples.
    Past (pre-forecast) model output.
``rainfall_past_72h_mm``
    Sum of hourly ``precipitation`` over ``[now - 72h, now)`` -- 72 samples. This
    is the *antecedent* rainfall that matters most for flood triggering, because
    river response lags rainfall.
``rainfall_forecast_72h_mm``
    Sum of hourly ``precipitation`` over ``[now, now + 72h)`` -- 72 samples.
    Forecast model output.
``discharge_latest_m3s``
    ``river_discharge`` for the current UTC day, or the most recent row.
``discharge_baseline_m3s``
    Mean ``river_discharge`` over the past, completed days (``date < today``).
``discharge_observed_peak_m3s``
    Max ``river_discharge`` over those past, completed days. The field name
    predates this clarification: "observed" here means "before today", i.e. the
    past-model part of the series. It does **not** mean a gauge measurement.
``discharge_forecast_peak_m3s``
    Max ``river_discharge`` from today onwards. A peak of ``0.0`` is a real
    measurement and is reported as such, not treated as missing.
``discharge_climatology_mean_m3s``
    Mean of the API's ``river_discharge_mean`` field (long-term mean for the
    modelled reach).

DATA PROVENANCE
---------------
Both sources are **numerical model output on a grid**, not station or gauge
measurements. "Past" values are the model's own output for elapsed hours
(hindcast), not observations. Rainfall is snapped to a nearest weather grid
cell; discharge to a nearest modelled river reach. See ``collectors/weather.py``
and ``collectors/flood.py`` for the per-source detail.

Discharge is a **daily** quantity in this pipeline because the flood API does
not expose hourly discharge (verified: HTTP 400). No hourly discharge is
synthesised to fill that gap.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any

from .validation import (
    coerce_float,
    coerce_float_list,
    max_or_none,
    mean_or_none,
    parse_api_timestamp,
    sum_or_none,
    truncate_to_shortest,
    utc_now,
)

#: Length of the antecedent-rainfall window used by the risk engine.
PAST_RAINFALL_WINDOW = timedelta(hours=72)

#: Short observed window reported for context.
SHORT_RAINFALL_WINDOW = timedelta(hours=24)

#: Length of the rainfall forecast window used by the risk engine.
FORECAST_RAINFALL_WINDOW = timedelta(hours=72)

#: Minimum number of fully observed discharge days needed before the
#: ``discharge_rise`` indicator is treated as well founded. Below this, the
#: baseline is too short to act as a meaningful "normal flow" reference.
MIN_OBSERVED_DISCHARGE_DAYS = 3


@dataclass(frozen=True)
class FloodFeatures:
    """Validated, hazard-specific inputs for the flood risk engine.

    Every field is either a measured value or ``None``. ``None`` means "not
    available", never "zero".
    """

    rainfall_past_24h_mm: float | None = None
    rainfall_past_72h_mm: float | None = None
    rainfall_forecast_72h_mm: float | None = None

    discharge_latest_m3s: float | None = None
    discharge_latest_date: str | None = None
    discharge_latest_is_forecast: bool | None = None
    discharge_baseline_m3s: float | None = None
    discharge_observed_peak_m3s: float | None = None
    discharge_forecast_peak_m3s: float | None = None
    discharge_climatology_mean_m3s: float | None = None
    #: How many fully observed (date < today) discharge rows backed the baseline.
    discharge_observed_days: int | None = None

    #: Coordinates of the model grid cell the API actually returned. These
    #: differ slightly from the requested point and are reported for honesty.
    weather_grid: dict[str, Any] | None = None
    flood_grid: dict[str, Any] | None = None

    #: Human-readable description of every anomaly found while processing.
    warnings: tuple[str, ...] = ()
    #: How many individual values could not be read as finite numbers.
    discarded_values: int = 0
    #: Which inputs were supplied at all.
    weather_available: bool = False
    flood_available: bool = False

    @property
    def has_full_discharge_history(self) -> bool:
        """True when enough past days backed the discharge baseline.

        When this is ``False`` the ``discharge_rise`` indicator is computed from
        a short record, and the risk engine says so in its notes.
        """
        return (self.discharge_observed_days or 0) >= MIN_OBSERVED_DISCHARGE_DAYS

    def as_evidence(self) -> dict[str, Any]:
        """Compact, JSON-friendly view used in the output contract."""
        return {
            "rainfall_past_24h_mm": _round(self.rainfall_past_24h_mm),
            "rainfall_past_72h_mm": _round(self.rainfall_past_72h_mm),
            "rainfall_forecast_72h_mm": _round(self.rainfall_forecast_72h_mm),
            "discharge_latest_m3s": _round(self.discharge_latest_m3s),
            "discharge_latest_date": self.discharge_latest_date,
            "discharge_latest_is_forecast": self.discharge_latest_is_forecast,
            "discharge_baseline_m3s": _round(self.discharge_baseline_m3s),
            "discharge_observed_peak_m3s": _round(self.discharge_observed_peak_m3s),
            "discharge_forecast_peak_m3s": _round(self.discharge_forecast_peak_m3s),
            "discharge_climatology_mean_m3s": _round(
                self.discharge_climatology_mean_m3s
            ),
            "discharge_observed_days": self.discharge_observed_days,
            "discarded_values": self.discarded_values,
        }


def _round(value: float | None, digits: int = 2) -> float | None:
    return None if value is None else round(value, digits)


def _grid_info(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    info: dict[str, Any] = {}
    for key in ("latitude", "longitude", "elevation"):
        number = coerce_float(payload.get(key))
        if number is not None:
            info[key] = round(number, 5)
    return info or None


def _hourly_rainfall_totals(
    weather: dict[str, Any], now: datetime, warnings: list[str]
) -> tuple[float | None, float | None, float | None, int]:
    """Return ``(past_24h, past_72h, forecast_72h, discarded)`` in millimetres."""
    hourly = weather.get("hourly")
    if not isinstance(hourly, dict):
        warnings.append("weather payload has no 'hourly' block")
        return None, None, None, 0

    raw_time = hourly.get("time")
    raw_precip = hourly.get("precipitation")
    if not isinstance(raw_time, list) or not isinstance(raw_precip, list):
        warnings.append("weather 'hourly' block is missing 'time' or 'precipitation'")
        return None, None, None, 0

    time_values, (precipitation,) = truncate_to_shortest(raw_time, raw_precip)
    if len(time_values) != len(raw_time):
        warnings.append(
            f"weather hourly series length mismatch: time={len(raw_time)}, "
            f"precipitation={len(raw_precip)}; truncated to {len(time_values)}"
        )

    values, dropped = coerce_float_list(precipitation)
    if dropped:
        warnings.append(
            f"discarded {dropped} unreadable hourly precipitation value(s)"
        )

    past_24: list[float | None] = []
    past_72: list[float | None] = []
    forecast_72: list[float | None] = []
    unparsed = 0

    # Window semantics: an Open-Meteo hourly value at time T is the accumulation
    # over the hour *beginning* at T. So the 24 hours ending at ``now`` are
    # ``[now - 24h, now)`` and the next 72 hours are ``[now, now + 72h]``. These
    # half-open bounds make the windows exact and non-overlapping for any phase
    # of ``now`` within the hour.
    for stamp, value in zip(time_values, values):
        moment = parse_api_timestamp(stamp)
        if moment is None:
            unparsed += 1
            continue
        if now <= moment < now + FORECAST_RAINFALL_WINDOW:
            forecast_72.append(value)
        elif now - SHORT_RAINFALL_WINDOW <= moment < now:
            past_24.append(value)
        elif now - PAST_RAINFALL_WINDOW <= moment < now:
            past_72.append(value)

    if unparsed:
        warnings.append(f"skipped {unparsed} hourly timestamp(s) that could not be parsed")

    # past_72 must include the past_24 hours, otherwise the 72h antecedent total
    # would silently understate the recent rainfall that is already known.
    if past_24 and past_72:
        past_72 = past_72 + past_24

    return (
        sum_or_none(past_24),
        sum_or_none(past_72),
        sum_or_none(forecast_72),
        dropped,
    )


def _align_optional(
    series: Any, length: int
) -> tuple[list[Any], str]:
    """Fit an optional series to ``length`` positions.

    Returns the fitted list and one of three states:

    ``"aligned"``
        The series was already the right length.
    ``"absent"``
        The key was missing or not a list; every position becomes ``None``.
    ``"misaligned"``
        The series was present but a different length; it was truncated or
        right-padded with ``None``. Unmatched positions read as "unavailable",
        never as zero.
    """
    if not isinstance(series, list):
        return [None] * length, "absent"
    if len(series) == length:
        return list(series), "aligned"
    fitted = list(series[:length])
    fitted.extend([None] * (length - len(fitted)))
    return fitted, "misaligned"


def _daily_discharge(
    flood: dict[str, Any], now: datetime, warnings: list[str]
) -> dict[str, Any]:
    """Split the daily discharge block into observed / today / forecast parts."""
    daily = flood.get("daily")
    if not isinstance(daily, dict):
        warnings.append("flood payload has no 'daily' block")
        return {}

    raw_time = daily.get("time")
    raw_discharge = daily.get("river_discharge")
    raw_mean = daily.get("river_discharge_mean")
    raw_max = daily.get("river_discharge_max")

    if not isinstance(raw_time, list) or not isinstance(raw_discharge, list):
        warnings.append("flood 'daily' block is missing 'time' or 'river_discharge'")
        return {}

    # ``time`` and ``river_discharge`` are required, so they define the length
    # of the aligned block. ``river_discharge_mean`` and ``river_discharge_max``
    # are optional and are fitted to that length afterwards: an absent optional
    # series must not shorten the required ones.
    time_values, (discharge,) = truncate_to_shortest(raw_time, raw_discharge)
    if len(time_values) != len(raw_time):
        warnings.append(
            f"flood daily series length mismatch: time={len(raw_time)}, "
            f"river_discharge={len(raw_discharge)}; truncated to {len(time_values)}"
        )

    mean_series, mean_state = _align_optional(raw_mean, len(time_values))
    max_series, max_state = _align_optional(raw_max, len(time_values))
    if mean_state == "absent":
        warnings.append("flood payload has no 'river_discharge_mean' series")
    elif mean_state == "misaligned":
        warnings.append(
            "'river_discharge_mean' length differs from the time axis; "
            "unmatched entries were treated as unavailable"
        )
    if max_state == "absent":
        warnings.append("flood payload has no 'river_discharge_max' series")
    elif max_state == "misaligned":
        warnings.append(
            "'river_discharge_max' length differs from the time axis; "
            "unmatched entries were treated as unavailable"
        )

    discharge, dropped = coerce_float_list(discharge)
    mean_series, dropped_mean = coerce_float_list(mean_series)
    max_series, dropped_max = coerce_float_list(max_series)
    if dropped or dropped_mean or dropped_max:
        warnings.append(
            f"discarded {dropped + dropped_mean + dropped_max} unreadable "
            "discharge value(s)"
        )

    today = now.date()
    observed: list[float | None] = []
    current: list[float | None] = []
    current_dates: list[str] = []
    forecast: list[float | None] = []
    # Rows whose timestamp actually parsed, in payload order, tagged with
    # whether they belong to the current day. "Latest" is chosen from this list
    # so a malformed stamp can never win the selection.
    parsable: list[tuple[str, float | None, bool]] = []

    for stamp, value in zip(time_values, discharge):
        moment = parse_api_timestamp(stamp)
        if moment is None:
            continue
        is_today = moment.date() == today
        parsable.append((stamp, value, is_today))
        if moment.date() < today:
            observed.append(value)
        elif is_today:
            current.append(value)
            current_dates.append(stamp)
        else:
            forecast.append(value)

    if not observed and not current and not forecast:
        warnings.append("flood 'daily' block contained no parsable timestamps")
        return {}

    # "Latest" is the most recent row that actually carries a discharge value:
    # today's row when one is usable, otherwise the last usable row we have.
    # latest_is_forecast records which of the two we got, because a today-row is
    # a partly-elapsed forecast day, not an observation.
    #
    # A row holding None must never win this selection: it would publish "no
    # reading" while a usable measurement sits right beside it. Conversely 0.0 is
    # a real measurement, so every test below is an explicit `is not None`
    # rather than a truthiness check.
    usable_today = [
        row for row in parsable if row[2] and row[1] is not None
    ]
    usable_any = [row for row in parsable if row[1] is not None]

    if usable_today:
        latest_date, latest, _ = usable_today[-1]
        latest_is_forecast = True
    elif usable_any:
        latest_date, latest, _ = usable_any[-1]
        latest_is_forecast = False
        warnings.append(
            "flood payload has no usable row for the current day; using the "
            f"most recent available row ({latest_date})"
        )
    else:
        # Every row we could parse is missing a value, so there is genuinely
        # nothing to report as latest.
        return {}

    # A forecast peak of 0.0 is a real measurement, not a missing value, so this
    # must test for None explicitly. Using `or` here would discard a legitimate
    # zero and silently report the current-day value instead.
    forecast_peak = max_or_none(forecast)
    if forecast_peak is None:
        forecast_peak = max_or_none(current)

    return {
        "latest_m3s": latest,
        "latest_date": latest_date,
        "latest_is_forecast": latest_is_forecast,
        "baseline_m3s": mean_or_none(observed),
        "observed_days": sum(1 for v in observed if v is not None),
        "observed_peak_m3s": max_or_none(observed),
        "forecast_peak_m3s": forecast_peak,
        "climatology_mean_m3s": mean_or_none(mean_series),
        "observed_max_of_day_m3s": max_or_none(max_series),
        "discarded": dropped + dropped_mean + dropped_max,
    }


def build_flood_features(
    weather: dict[str, Any] | None,
    flood: dict[str, Any] | None,
    *,
    now: datetime | None = None,
) -> FloodFeatures:
    """Build :class:`FloodFeatures` from raw collector payloads.

    Parameters
    ----------
    weather:
        Raw payload from :func:`collectors.weather.get_weather`, or ``None`` if
        the weather source was unavailable.
    flood:
        Raw payload from :func:`collectors.flood.get_flood`, or ``None``.
    now:
        Reference time for the observation/forecast split. Defaults to the
        current UTC time. Tests inject a fixed value for determinism.
    """
    reference = now or utc_now()
    warnings: list[str] = []
    discarded = 0

    past_24 = past_72 = forecast_72 = None
    weather_available = isinstance(weather, dict) and bool(weather)
    if weather_available:
        past_24, past_72, forecast_72, dropped = _hourly_rainfall_totals(
            weather, reference, warnings
        )
        discarded += dropped
    else:
        warnings.append("no weather payload supplied; rainfall features unavailable")

    discharge: dict[str, Any] = {}
    flood_available = isinstance(flood, dict) and bool(flood)
    if flood_available:
        discharge = _daily_discharge(flood, reference, warnings)
        discarded += int(discharge.get("discarded", 0))
        if not discharge:
            warnings.append("no usable discharge rows were found")
    else:
        warnings.append("no flood payload supplied; discharge features unavailable")

    return FloodFeatures(
        rainfall_past_24h_mm=past_24,
        rainfall_past_72h_mm=past_72,
        rainfall_forecast_72h_mm=forecast_72,
        discharge_latest_m3s=discharge.get("latest_m3s"),
        discharge_latest_date=discharge.get("latest_date"),
        discharge_latest_is_forecast=discharge.get("latest_is_forecast"),
        discharge_baseline_m3s=discharge.get("baseline_m3s"),
        discharge_observed_days=discharge.get("observed_days"),
        discharge_observed_peak_m3s=discharge.get("observed_peak_m3s"),
        discharge_forecast_peak_m3s=discharge.get("forecast_peak_m3s"),
        discharge_climatology_mean_m3s=discharge.get("climatology_mean_m3s"),
        weather_grid=_grid_info(weather),
        flood_grid=_grid_info(flood),
        warnings=tuple(warnings),
        discarded_values=discarded,
        weather_available=weather_available,
        flood_available=flood_available,
    )
