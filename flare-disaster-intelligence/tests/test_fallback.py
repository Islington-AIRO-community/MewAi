"""Tests for the live-then-synthetic fallback behaviour.

These exist because the first implementation of ``run_flood_with_fallback``
wrapped the live call in ``except DataSourceError``. That was dead code:
``run_flood_pipeline`` *records* a classified source failure and keeps going, so
it never raises. The fallback could therefore never fire, and the API's
``fallback_synthetic=false`` 503 branch could never fire either.

The correction is to detect a failed live attempt from the returned event
(``main.live_collection_is_unusable``) rather than from an exception. These tests
pin that behaviour so it cannot silently regress.

No network calls are made.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

import api
import main
from collectors.base import DataSourceError
from tests.conftest import NOW, daily_payload, hourly_payload
from pipeline import run_flood_pipeline
from schemas.events import Location

PLACE = Location(name="Testville", latitude=27.7, longitude=85.3)


def _boom(reason: str = "network_unreachable", detail: str = "simulated"):
    """A collector that fails the way a real one does."""

    def fetcher(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
        raise DataSourceError(
            source="simulated", reason=reason, detail=detail
        )

    return fetcher


def _live_event(*, weather_fetcher, flood_fetcher):
    return run_flood_pipeline(
        PLACE,
        now=NOW,
        weather_fetcher=weather_fetcher,
        flood_fetcher=flood_fetcher,
    )


# ---------------------------------------------------------------------------
# the predicate itself
# ---------------------------------------------------------------------------


def test_total_source_failure_is_unusable():
    event = _live_event(
        weather_fetcher=_boom(), flood_fetcher=_boom("timeout", "timed out")
    )
    assert event.data_quality.origin == "none"
    assert event.risk_score is None
    assert main.live_collection_is_unusable(event) is True


def test_healthy_live_run_is_usable():
    event = _live_event(
        weather_fetcher=lambda *a, **k: hourly_payload([2.0] * 200),
        flood_fetcher=lambda *a, **k: daily_payload([50.0] * 8),
    )
    assert event.data_quality.origin == "live_api"
    assert event.risk_score is not None
    assert main.live_collection_is_unusable(event) is False


def test_partial_live_data_is_still_usable():
    """Real degraded data beats a synthetic scenario, so it must not fall back."""
    event = _live_event(
        weather_fetcher=lambda *a, **k: hourly_payload([2.0] * 200),
        flood_fetcher=_boom(),
    )
    assert event.data_quality.origin == "partial"
    assert main.live_collection_is_unusable(event) is False


def test_data_arriving_but_yielding_no_indicator_is_unusable():
    """Sources that answer 'ok' with nothing usable is still a failed attempt."""
    event = _live_event(
        weather_fetcher=lambda *a, **k: hourly_payload([None] * 200),
        flood_fetcher=lambda *a, **k: daily_payload([None] * 8),
    )
    assert event.risk_score is None
    assert main.live_collection_is_unusable(event) is True


def test_describe_source_failures_names_each_source():
    event = _live_event(
        weather_fetcher=_boom("timeout", "read timed out"),
        flood_fetcher=_boom("http_error", "503 Server Error"),
    )
    text = main.describe_source_failures(event)
    assert "open-meteo-weather=timeout" in text
    assert "read timed out" in text
    assert "open-meteo-flood-glofas=http_error" in text
    assert "503 Server Error" in text


# ---------------------------------------------------------------------------
# the fallback helper
# ---------------------------------------------------------------------------


def test_fallback_fires_when_both_sources_fail(monkeypatch, capsys):
    monkeypatch.setattr(
        main,
        "run_flood_live",
        lambda place: _live_event(weather_fetcher=_boom(), flood_fetcher=_boom()),
    )
    event = main.run_flood_with_fallback(PLACE, "severe")
    assert event.data_quality.origin == "synthetic_demo"
    assert event.data_quality.is_synthetic is True
    assert all(s.origin == "synthetic_demo" for s in event.data_quality.sources)
    err = capsys.readouterr().err
    assert "no usable data" in err
    assert "NOT live data" in err


def test_fallback_keeps_a_healthy_live_result(monkeypatch, capsys):
    monkeypatch.setattr(
        main,
        "run_flood_live",
        lambda place: _live_event(
            weather_fetcher=lambda *a, **k: hourly_payload([2.0] * 200),
            flood_fetcher=lambda *a, **k: daily_payload([50.0] * 8),
        ),
    )
    event = main.run_flood_with_fallback(PLACE, "severe")
    assert event.data_quality.origin == "live_api"
    assert event.data_quality.is_synthetic is False
    assert "NOT live data" not in capsys.readouterr().err


def test_fallback_keeps_a_partial_live_result(monkeypatch):
    monkeypatch.setattr(
        main,
        "run_flood_live",
        lambda place: _live_event(
            weather_fetcher=lambda *a, **k: hourly_payload([2.0] * 200),
            flood_fetcher=_boom(),
        ),
    )
    event = main.run_flood_with_fallback(PLACE, "severe")
    assert event.data_quality.origin == "partial"
    assert event.data_quality.is_synthetic is False


# ---------------------------------------------------------------------------
# the API's fail-loudly branch
# ---------------------------------------------------------------------------


@pytest.fixture
def client() -> TestClient:
    return TestClient(api.app)


def test_api_returns_503_when_live_fails_and_fallback_is_disabled(client, monkeypatch):
    monkeypatch.setattr(
        api,
        "run_flood_live",
        lambda place: _live_event(weather_fetcher=_boom(), flood_fetcher=_boom()),
    )
    response = client.get("/v1/flood?fallback_synthetic=false")
    assert response.status_code == 503
    assert "no usable data" in response.json()["detail"]


def test_api_does_not_503_when_live_data_is_partial(client, monkeypatch):
    monkeypatch.setattr(
        api,
        "run_flood_live",
        lambda place: _live_event(
            weather_fetcher=lambda *a, **k: hourly_payload([2.0] * 200),
            flood_fetcher=_boom(),
        ),
    )
    response = client.get("/v1/flood?fallback_synthetic=false")
    assert response.status_code == 200
    assert response.json()["data_quality"]["origin"] == "partial"


def test_api_falls_back_and_says_so(client, monkeypatch):
    # ``main.run_flood_with_fallback`` resolves ``run_flood_live`` from main's own
    # globals, so that is the name that has to be patched.
    monkeypatch.setattr(
        main,
        "run_flood_live",
        lambda place: _live_event(weather_fetcher=_boom(), flood_fetcher=_boom()),
    )
    response = client.get("/v1/flood?fallback_synthetic=true")
    assert response.status_code == 200
    body = response.json()
    assert body["data_quality"]["origin"] == "synthetic_demo"
    assert body["data_quality"]["is_synthetic"] is True
