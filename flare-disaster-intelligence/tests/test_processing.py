"""Data validation and feature-extraction tests.

Covers the "missing / null / malformed / invalid value" requirements: the
pipeline must degrade with a recorded warning, never crash and never silently
turn a missing reading into a zero.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

import pytest

from processing.flood_features import (
    MIN_OBSERVED_DISCHARGE_DAYS,
    build_flood_features,
)
from processing.validation import (
    coerce_float,
    coerce_float_list,
    max_or_none,
    mean_or_none,
    parse_api_timestamp,
    sum_or_none,
    truncate_to_shortest,
)
from tests.conftest import NOW, daily_payload, hourly_payload


# ---------------------------------------------------------------------------
# validation primitives
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (5, 5.0),
        (5.5, 5.5),
        ("7.25", 7.25),
        ("  8  ", 8.0),
        (0, 0.0),
        (-3.5, -3.5),
    ],
)
def test_coerce_float_accepts_readable_numbers(value, expected):
    assert coerce_float(value) == pytest.approx(expected)


@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        "   ",
        "abc",
        "nan",
        "inf",
        "-inf",
        float("nan"),
        float("inf"),
        True,
        False,
        [1],
        {"a": 1},
        (1, 2),
        object(),
    ],
)
def test_coerce_float_rejects_unreadable_values(value):
    assert coerce_float(value) is None


def test_coerce_float_list_preserves_positions_and_counts_drops():
    values, dropped = coerce_float_list([1.0, None, "x", 4.0, ""])
    assert values == [1.0, None, None, 4.0, None]
    assert dropped == 2  # "x" and ""; a genuine null is not a bad value


def test_coerce_float_list_on_a_non_list():
    assert coerce_float_list("nope") == ([], 0)
    assert coerce_float_list(None) == ([], 0)


def test_truncate_to_shortest_keeps_series_aligned():
    times, (a, b) = truncate_to_shortest([1, 2, 3, 4], ["a", "b"], ["x", "y", "z"])
    assert times == [1, 2]
    assert a == ["a", "b"]
    assert b == ["x", "y"]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("2026-09-26T00:00", datetime(2026, 9, 26, tzinfo=timezone.utc)),
        ("2026-09-26", datetime(2026, 9, 26, tzinfo=timezone.utc)),
        ("2026-09-26T05:30:00Z", datetime(2026, 9, 26, 5, 30, tzinfo=timezone.utc)),
    ],
)
def test_parse_api_timestamp(text, expected):
    assert parse_api_timestamp(text) == expected


@pytest.mark.parametrize("value", [None, "", "not-a-date", 12345, {}])
def test_parse_api_timestamp_rejects_junk(value):
    assert parse_api_timestamp(value) is None


def test_aggregate_helpers_ignore_none():
    assert mean_or_none([1.0, None, 3.0]) == pytest.approx(2.0)
    assert max_or_none([1.0, None, 3.0]) == 3.0
    assert sum_or_none([1.0, None, 3.0]) == 4.0


def test_aggregate_helpers_return_none_when_nothing_is_usable():
    assert mean_or_none([]) is None
    assert mean_or_none([None, None]) is None
    assert max_or_none([]) is None
    assert sum_or_none([]) is None
    assert sum_or_none([None, None]) is None


# ---------------------------------------------------------------------------
# rainfall feature extraction
# ---------------------------------------------------------------------------


def test_rainfall_windows_are_measured_against_the_injected_clock():
    """72 hours of 1 mm/h ending exactly at ``now`` -> 72 mm past, 0 forecast."""
    values = [1.0] * 72
    weather = hourly_payload(values, start=NOW - timedelta(hours=72))
    features = build_flood_features(weather, None, now=NOW)
    assert features.rainfall_past_24h_mm == pytest.approx(24.0)
    assert features.rainfall_past_72h_mm == pytest.approx(72.0)
    assert features.rainfall_forecast_72h_mm is None


def test_forecast_rainfall_is_separated_from_observed_rainfall():
    values = [0.0] * 72 + [2.0] * 24
    weather = hourly_payload(values, start=NOW - timedelta(hours=72))
    features = build_flood_features(weather, None, now=NOW)
    assert features.rainfall_past_24h_mm == pytest.approx(0.0)
    assert features.rainfall_forecast_72h_mm == pytest.approx(48.0)


def test_antecedent_total_includes_the_last_24_hours():
    """Regression guard: the 72h window must not exclude the most recent day."""
    values = [0.0] * 48 + [5.0] * 24
    weather = hourly_payload(values, start=NOW - timedelta(hours=72))
    features = build_flood_features(weather, None, now=NOW)
    assert features.rainfall_past_24h_mm == pytest.approx(120.0)
    assert features.rainfall_past_72h_mm == pytest.approx(120.0)


def test_forecast_window_holds_exactly_72_hours():
    """The forecast window is ``[now, now + 72h)``, so 1 mm/h for 96 h is 72 mm.

    Regression guard for the inclusive upper bound, which made the window 73
    samples wide while every document described it as 72 hours.
    """
    weather = hourly_payload([1.0] * 96, start=NOW)
    features = build_flood_features(weather, None, now=NOW)
    assert features.rainfall_forecast_72h_mm == pytest.approx(72.0)


def test_forecast_window_excludes_the_72_hour_boundary_sample():
    """A sample landing exactly on ``now + 72h`` belongs to the next window."""
    values = [0.0] * 72 + [1000.0]
    weather = hourly_payload(values, start=NOW)
    assert weather["hourly"]["time"][-1] == "2026-09-29T12:00"
    features = build_flood_features(weather, None, now=NOW)
    assert features.rainfall_forecast_72h_mm == pytest.approx(0.0)


def test_all_rainfall_windows_are_half_open_and_72_samples_wide():
    """Past and forecast windows use the same lower-inclusive convention."""
    weather = hourly_payload([1.0] * 168, start=NOW - timedelta(hours=72))
    features = build_flood_features(weather, None, now=NOW)
    assert features.rainfall_past_24h_mm == pytest.approx(24.0)
    assert features.rainfall_past_72h_mm == pytest.approx(72.0)
    assert features.rainfall_forecast_72h_mm == pytest.approx(72.0)


def test_zero_forecast_discharge_peak_is_not_treated_as_missing():
    """Regression guard: a forecast peak of ``0.0`` is data, not an absent value.

    ``max_or_none(forecast) or max_or_none(current)`` discarded a legitimate
    zero because ``0.0`` is falsy, publishing today's discharge as the forecast
    peak instead.
    """
    # indices 0-6 are past days, 7 is today, 8-9 are forecast.
    flood = daily_payload([50.0] * 7 + [300.0] + [0.0, 0.0])
    features = build_flood_features(None, flood, now=NOW)
    assert features.discharge_observed_peak_m3s == pytest.approx(50.0)
    assert features.discharge_forecast_peak_m3s == pytest.approx(0.0)
    assert features.discharge_latest_m3s == pytest.approx(300.0)


def test_forecast_peak_still_falls_back_to_today_when_no_forecast_rows_exist():
    """The ``None`` fallback survives the zero fix."""
    flood = daily_payload([50.0] * 7 + [300.0] + [None, None])
    features = build_flood_features(None, flood, now=NOW)
    assert features.discharge_forecast_peak_m3s == pytest.approx(300.0)


def test_missing_hourly_block_is_reported_not_fatal():
    features = build_flood_features({"latitude": 1.0}, None, now=NOW)
    assert features.rainfall_past_72h_mm is None
    assert any("no 'hourly' block" in w for w in features.warnings)
    assert features.weather_available is True


def test_missing_precipitation_series_is_reported():
    weather = {"hourly": {"time": ["2026-09-26T00:00"]}}
    features = build_flood_features(weather, None, now=NOW)
    assert features.rainfall_past_72h_mm is None
    assert any("missing 'time' or 'precipitation'" in w for w in features.warnings)


def test_series_shorter_than_its_time_axis_is_truncated_with_a_warning():
    weather = hourly_payload([1.0] * 10, time_length=24)
    features = build_flood_features(weather, None, now=NOW)
    assert any("length mismatch" in w for w in features.warnings)
    assert features.rainfall_past_72h_mm is not None


def test_unparsable_values_become_none_and_are_counted():
    values = [None, "abc", "", 3.0, 3.0, 3.0, 3.0, 3.0]
    weather = hourly_payload(values, start=NOW - timedelta(hours=8))
    features = build_flood_features(weather, None, now=NOW)
    assert features.discarded_values == 2
    assert any("unreadable hourly precipitation" in w for w in features.warnings)
    assert features.rainfall_past_24h_mm == pytest.approx(15.0)


def test_unparsable_timestamps_are_skipped_with_a_warning():
    weather = hourly_payload([1.0, 1.0], start=NOW - timedelta(hours=2))
    weather["hourly"]["time"] = ["not-a-time", "also-not"]
    features = build_flood_features(weather, None, now=NOW)
    assert features.rainfall_past_24h_mm is None
    assert any("could not be parsed" in w for w in features.warnings)


# ---------------------------------------------------------------------------
# discharge feature extraction
# ---------------------------------------------------------------------------


def test_discharge_splits_into_observed_today_and_forecast():
    discharges = [5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 11.0, 40.0, 30.0, 20.0]
    flood = daily_payload(discharges)
    features = build_flood_features(None, flood, now=NOW)
    # indices 0-6 are the 7 observed days, index 7 is today, 8-9 are forecast
    assert features.discharge_baseline_m3s == pytest.approx(8.0)
    assert features.discharge_observed_peak_m3s == pytest.approx(11.0)
    assert features.discharge_latest_m3s == pytest.approx(40.0)
    assert features.discharge_forecast_peak_m3s == pytest.approx(30.0)
    assert features.discharge_observed_days == 7
    assert features.discharge_latest_is_forecast is True


def test_climatology_mean_is_read_from_its_own_field():
    flood = daily_payload([5.0] * 10, means=[2.0, 4.0, 6.0, 8.0, 10.0,
                                             12.0, 14.0, 16.0, 18.0, 20.0])
    features = build_flood_features(None, flood, now=NOW)
    assert features.discharge_climatology_mean_m3s == pytest.approx(11.0)


# ---------------------------------------------------------------------------
# latest-row selection
# ---------------------------------------------------------------------------


def test_latest_row_is_today_when_it_carries_a_value():
    """Normal, valid behaviour: today's row is the latest reading."""
    flood = daily_payload([5.0] * 7 + [40.0, 30.0, 20.0])
    features = build_flood_features(None, flood, now=NOW)
    assert features.discharge_latest_m3s == pytest.approx(40.0)
    assert features.discharge_latest_date == "2026-09-26"
    assert features.discharge_latest_is_forecast is True
    assert not any("no usable row" in w for w in features.warnings)


def test_a_none_today_row_does_not_override_an_older_usable_value():
    """Regression guard: a missing value must not win latest-row selection.

    The old code took ``current[-1]`` unconditionally, so a ``None`` in today's
    row published ``discharge_latest_m3s = None`` even though real discharge
    measurements were present in the payload.
    """
    flood = daily_payload([5.0] * 7 + [None, 30.0, 20.0])
    features = build_flood_features(None, flood, now=NOW)
    # today's row is unusable, so the most recent usable row wins
    assert features.discharge_latest_m3s == pytest.approx(20.0)
    assert features.discharge_latest_date == "2026-09-28"
    assert features.discharge_latest_is_forecast is False
    assert any("no usable row for the current day" in w for w in features.warnings)


def test_a_later_none_row_does_not_hide_an_earlier_usable_today_row():
    """A usable today-row is still preferred over a later missing forecast row."""
    flood = daily_payload([5.0] * 7 + [40.0, None, 20.0])
    features = build_flood_features(None, flood, now=NOW)
    assert features.discharge_latest_m3s == pytest.approx(40.0)
    assert features.discharge_latest_date == "2026-09-26"
    assert features.discharge_latest_is_forecast is True


def test_a_malformed_timestamp_cannot_win_latest_row_selection():
    """Regression guard: only rows with a parsable stamp are eligible.

    The old fallback scanned the raw ``time``/value lists without checking that
    the timestamp parsed, so a trailing garbage stamp carrying a large value was
    reported as the latest discharge.
    """
    flood = daily_payload([5.0] * 7 + [40.0, 30.0, 20.0])
    flood["daily"]["time"][-1] = "not-a-timestamp"
    features = build_flood_features(None, flood, now=NOW)
    # today is still usable here, so the malformed trailing row is simply ignored
    assert features.discharge_latest_m3s == pytest.approx(40.0)
    assert features.discharge_latest_date == "2026-09-26"

    # and with no usable today-row, the malformed row is still not chosen
    flood = daily_payload([5.0] * 7 + [None, 30.0, 9999.0])
    flood["daily"]["time"][-1] = "not-a-timestamp"
    features = build_flood_features(None, flood, now=NOW)
    assert features.discharge_latest_m3s == pytest.approx(30.0)
    assert features.discharge_latest_date == "2026-09-27"


def test_no_usable_rows_yields_no_latest_reading():
    """Every parsable row is missing a value, so there is nothing to report."""
    flood = daily_payload([None] * 10)
    features = build_flood_features(None, flood, now=NOW)
    assert features.discharge_latest_m3s is None
    assert features.discharge_baseline_m3s is None


def test_zero_discharge_is_a_valid_latest_reading():
    """0.0 is a real measurement and must never be treated as missing."""
    flood = daily_payload([5.0] * 7 + [0.0, 30.0, 20.0])
    features = build_flood_features(None, flood, now=NOW)
    assert features.discharge_latest_m3s == pytest.approx(0.0)
    assert features.discharge_latest_date == "2026-09-26"
    assert features.discharge_latest_is_forecast is True

    # and a zero today-row still beats falling back to an older row
    flood = daily_payload([5.0] * 7 + [0.0])
    features = build_flood_features(None, flood, now=NOW)
    assert features.discharge_latest_m3s == pytest.approx(0.0)
    assert features.discharge_latest_date == "2026-09-26"


def test_null_discharge_rows_are_preserved_as_missing_not_zero():
    discharges = [5.0, None, 7.0, 8.0, 9.0, 10.0, 11.0, 40.0]
    flood = daily_payload(discharges)
    features = build_flood_features(None, flood, now=NOW)
    assert features.discharge_observed_days == 6
    assert features.discharge_baseline_m3s == pytest.approx((5 + 7 + 8 + 9 + 10 + 11) / 6)


def test_absent_optional_series_does_not_destroy_the_required_one():
    """Regression test: an omitted ``river_discharge_max`` must not truncate
    ``river_discharge`` to nothing."""
    flood = daily_payload([5.0] * 10, include_max=False)
    features = build_flood_features(None, flood, now=NOW)
    assert features.discharge_latest_m3s == pytest.approx(5.0)
    assert features.discharge_observed_days == 7
    assert any("no 'river_discharge_max' series" in w for w in features.warnings)


def test_misaligned_optional_series_is_padded_not_truncated():
    flood = daily_payload([5.0] * 10, include_max=False)
    flood["daily"]["river_discharge_max"] = [1.0, 2.0]
    features = build_flood_features(None, flood, now=NOW)
    assert features.discharge_latest_m3s == pytest.approx(5.0)
    assert any("differs from the time axis" in w for w in features.warnings)


def test_missing_daily_block_is_reported():
    features = build_flood_features(None, {"latitude": 1.0}, now=NOW)
    assert features.discharge_latest_m3s is None
    assert any("no 'daily' block" in w for w in features.warnings)


def test_unparsable_discharge_timestamps_yield_nothing():
    flood = daily_payload([5.0] * 5)
    flood["daily"]["time"] = ["bad"] * 5
    features = build_flood_features(None, flood, now=NOW)
    assert features.discharge_latest_m3s is None
    assert any("no parsable timestamps" in w for w in features.warnings)


def test_has_full_discharge_history_threshold():
    short = build_flood_features(None, daily_payload([5.0] * 10), now=NOW)
    assert short.discharge_observed_days == 7
    assert short.has_full_discharge_history is True

    payload = daily_payload([5.0] * 10)
    payload["daily"]["time"] = payload["daily"]["time"][-2:]
    payload["daily"]["river_discharge"] = [5.0, 6.0]
    tiny = build_flood_features(None, payload, now=NOW)
    assert tiny.discharge_observed_days < MIN_OBSERVED_DISCHARGE_DAYS
    assert tiny.has_full_discharge_history is False


# ---------------------------------------------------------------------------
# total absence of data
# ---------------------------------------------------------------------------


def test_no_inputs_at_all_is_handled():
    features = build_flood_features(None, None, now=NOW)
    assert features.weather_available is False
    assert features.flood_available is False
    assert features.rainfall_past_72h_mm is None
    assert features.discharge_latest_m3s is None
    assert len(features.warnings) == 2


def test_empty_dicts_count_as_unavailable():
    features = build_flood_features({}, {}, now=NOW)
    assert features.weather_available is False
    assert features.flood_available is False


def test_grid_metadata_is_captured_and_null_safe():
    weather = hourly_payload([0.0])
    weather["latitude"] = None
    flood = daily_payload([5.0] * 10)
    features = build_flood_features(weather, flood, now=NOW)
    assert features.weather_grid == {"longitude": 85.3483, "elevation": 1301.0}
    assert features.flood_grid is not None
    assert features.flood_grid["latitude"] == pytest.approx(27.725)


def test_evidence_is_json_friendly():
    import json

    features = build_flood_features(
        hourly_payload([1.0] * 72), daily_payload([5.0] * 10), now=NOW
    )
    json.dumps(features.as_evidence())


def test_discarded_values_accumulate_across_both_sources():
    # 24 groups of (None, "x", 1.0): the null is a genuine absence, the string
    # is an unreadable value -> 24 discarded from the rainfall series.
    weather = hourly_payload([None, "x", 1.0] * 24)
    # 1 unreadable value in each of the three discharge series -> 3 more.
    flood = daily_payload(
        [None, "y"] + [5.0] * 8,
        means=[None, "y"] + [2.5] * 8,
        maxima=[None, "y"] + [10.0] * 8,
    )
    features = build_flood_features(weather, flood, now=NOW)
    assert features.discarded_values == 27
    assert any("unreadable hourly precipitation" in w for w in features.warnings)
    assert any("unreadable discharge value" in w for w in features.warnings)
