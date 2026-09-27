"""FLARE Disaster Intelligence Layer - command-line entry point.

Run the flood pipeline against the live public APIs::

    python main.py

Run it with no network at all, using clearly-labelled synthetic scenarios::

    python main.py --offline
    python main.py --offline --scenario severe

Try live first and fall back to a synthetic scenario if the network fails::

    python main.py --fallback-synthetic

Other commands::

    python main.py locations        # list demo locations
    python main.py thresholds       # print every threshold and weight
    python main.py scenarios        # list synthetic demo scenarios
    python main.py --json           # emit the full output contract as JSON

The earthquake path from the original prototype is still available via
``run_earthquake_demo`` and is exercised by ``api.py``; expanding earthquake
intelligence is a later milestone.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from collectors.earthquake import extract_significant_events, get_recent_earthquakes
from demo.fixtures import DEFAULT_SCENARIO, available_scenarios, load_scenario
from pipeline import PROTOTYPE_DISCLAIMER, run_flood_pipeline
from risk.config import describe_thresholds
from risk.earthquake import assess_earthquake
from schemas.events import IntelligenceEvent, Location

#: Demo locations. Coordinates are real city coordinates; only the assessment
#: of flood risk at them is prototype-grade.
DEMO_LOCATIONS: dict[str, Location] = {
    "kathmandu": Location(name="Kathmandu", latitude=27.7172, longitude=85.3240),
    "biratnagar": Location(name="Biratnagar", latitude=26.4525, longitude=87.2718),
    "pokhara": Location(name="Pokhara", latitude=28.2096, longitude=83.9856),
    "butwal": Location(name="Butwal", latitude=27.7006, longitude=83.4482),
    "birgunj": Location(name="Birgunj", latitude=27.0104, longitude=84.8770),
}

DEFAULT_LOCATION = "kathmandu"

#: Kept from the original prototype so ``api.py`` and existing notes still work.
DEMO_LOCATION = {
    "name": DEMO_LOCATIONS[DEFAULT_LOCATION].name,
    "latitude": DEMO_LOCATIONS[DEFAULT_LOCATION].latitude,
    "longitude": DEMO_LOCATIONS[DEFAULT_LOCATION].longitude,
}


# ---------------------------------------------------------------------------
# Flood entry points
# ---------------------------------------------------------------------------


def run_flood_live(location: Location) -> IntelligenceEvent:
    """Assess a location using the live Open-Meteo APIs."""
    return run_flood_pipeline(location)


def run_flood_offline(
    location: Location, scenario: str = DEFAULT_SCENARIO
) -> IntelligenceEvent:
    """Assess a location using a labelled synthetic scenario (no network)."""
    weather, flood = load_scenario(scenario)

    def fake_weather(lat: float, lon: float, **_: Any) -> dict[str, Any]:
        return weather

    def fake_flood(lat: float, lon: float, **_: Any) -> dict[str, Any]:
        return flood

    return run_flood_pipeline(
        location,
        weather_fetcher=fake_weather,
        flood_fetcher=fake_flood,
        data_origin="synthetic_demo",
    )


def live_collection_is_unusable(event: IntelligenceEvent) -> bool:
    """Did a live run fail to produce anything a human could act on?

    ``run_flood_pipeline`` deliberately *records* a source failure and carries on
    instead of raising, so a caller cannot detect a failed live attempt by
    catching an exception - it has to inspect the returned result. The live
    attempt counts as failed when no source returned usable data at all, or when
    the data that did arrive yielded no indicator (threat ``UNKNOWN``).

    A *partial* live result is **not** treated as unusable: real degraded data
    is more useful than a synthetic scenario, and the pipeline already suppresses
    alerting on it.
    """
    if event.data_quality.origin == "none":
        return True
    return event.risk_score is None


def describe_source_failures(event: IntelligenceEvent) -> str:
    """One-line summary of what each source reported, for error messages."""
    if not event.data_quality.sources:
        return "no data source reported a status"
    return "; ".join(
        f"{source.name}={source.status}"
        + (f" ({source.detail})" if source.detail else "")
        for source in event.data_quality.sources
    )


def run_flood_with_fallback(
    location: Location, scenario: str = DEFAULT_SCENARIO
) -> IntelligenceEvent:
    """Try the live APIs; fall back to a synthetic scenario if they yield nothing.

    The fallback is triggered by inspecting the live *result* (see
    :func:`live_collection_is_unusable`), not by catching an exception, because
    the pipeline records source failures rather than raising them.

    The fallback result is labelled ``synthetic_demo`` and the CLI prints a
    loud warning, so a fallback can never be mistaken for a live assessment.
    """
    event = run_flood_live(location)
    if not live_collection_is_unusable(event):
        return event

    print(
        "WARNING: live collection produced no usable data "
        f"({describe_source_failures(event)}).",
        file=sys.stderr,
    )
    print(
        f"WARNING: falling back to SYNTHETIC scenario '{scenario}'. "
        "This is NOT live data.",
        file=sys.stderr,
    )
    return run_flood_offline(location, scenario)


# ---------------------------------------------------------------------------
# Earthquake (carried over from the original prototype, not expanded here)
# ---------------------------------------------------------------------------


def run_earthquake_demo() -> dict[str, Any]:
    """Original prototype earthquake path, unchanged in scope.

    Earthquake intelligence expansion is a later milestone. This function is
    retained so the existing API endpoint keeps working.
    """
    feed = get_recent_earthquakes()
    events = extract_significant_events(feed)
    location = DEMO_LOCATIONS[DEFAULT_LOCATION]
    result = assess_earthquake(events, location.latitude, location.longitude)
    return {
        "disaster_type": "earthquake",
        "location": DEMO_LOCATION,
        "scope_note": (
            "Original prototype path. Magnitude/depth heuristic only; no "
            "distance attenuation, no exposure modelling, not Nepal-calibrated."
        ),
        **result,
    }


# ---------------------------------------------------------------------------
# Presentation
# ---------------------------------------------------------------------------


def print_event(event: IntelligenceEvent) -> None:
    """Human-readable summary of one assessment."""
    quality = event.data_quality
    print("=" * 72)
    print(f"FLARE Disaster Intelligence - {event.disaster_type.upper()}")
    print("=" * 72)
    print(f"event_id     : {event.event_id}")
    print(f"location     : {event.location.name} "
          f"({event.location.latitude}, {event.location.longitude})")
    print(f"timestamp    : {event.timestamp.isoformat()}")
    print()
    print(f"risk_score   : {event.risk_score}")
    print(f"threat_level : {event.assessment.threat_level}")
    print(f"alert        : {event.assessment.alert}")
    print(f"reason       : {event.assessment.reason}")
    if event.assessment.requires_manual_verification:
        print("** MANUAL VERIFICATION REQUIRED BEFORE PUBLISHING **")
    print()
    print(f"data origin  : {quality.origin}")
    print(f"coverage     : {quality.coverage:.0%}")
    print(f"indicators   : used={list(quality.indicators_used)}")
    if quality.indicators_missing:
        print(f"               missing={list(quality.indicators_missing)}")
    for status in quality.sources:
        detail = f" - {status.detail}" if status.detail else ""
        print(f"  - {status.name}: {status.status}{detail}")
    if quality.warnings:
        print("warnings     :")
        for warning in quality.warnings:
            print(f"  ! {warning}")
    print()
    print("measurements :")
    for key, value in event.evidence["measurements"].items():
        print(f"  {key}: {value}")
    print()
    print("indicator breakdown:")
    for indicator in event.evidence["indicators"]:
        state = "ok " if indicator["available"] else "n/a"
        print(
            f"  [{state}] {indicator['key']}: raw={indicator['raw_value']} "
            f"normalised={indicator['normalized']} "
            f"weight={indicator['weight']} "
            f"contribution={indicator['contribution']}"
        )
        if indicator["note"]:
            print(f"         {indicator['note']}")
    print()
    print("message      :")
    print(f"  {event.message}")
    print()


def _print_thresholds() -> None:
    print(json.dumps(describe_thresholds(), indent=2))


def _print_locations() -> None:
    for key, location in DEMO_LOCATIONS.items():
        print(
            f"  {key:<12} {location.name:<12} "
            f"({location.latitude}, {location.longitude})"
        )


def _print_scenarios() -> None:
    for name, description in available_scenarios().items():
        print(f"  {name}")
        for line in _wrap(description):
            print(f"      {line}")


def _wrap(text: str, width: int = 66) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current: list[str] = []
    for word in words:
        if sum(len(w) + 1 for w in current) + len(word) > width:
            lines.append(" ".join(current))
            current = [word]
        else:
            current.append(word)
    if current:
        lines.append(" ".join(current))
    return lines


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="FLARE Disaster Intelligence Layer prototype",
        epilog=PROTOTYPE_DISCLAIMER,
    )
    parser.add_argument(
        "--location",
        default=DEFAULT_LOCATION,
        choices=sorted(DEMO_LOCATIONS),
        help="location to assess (default: %(default)s)",
    )
    parser.add_argument(
        "--scenario",
        default=DEFAULT_SCENARIO,
        help="synthetic scenario name, used by --offline and --fallback-synthetic",
    )
    parser.add_argument(
        "--offline",
        action="store_true",
        help="use synthetic demo data only; makes no network calls",
    )
    parser.add_argument(
        "--fallback-synthetic",
        action="store_true",
        help="try the live APIs first, fall back to synthetic data on failure",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="print the full output contract as JSON instead of a summary",
    )
    parser.add_argument(
        "--earthquake",
        action="store_true",
        help="run the original prototype earthquake path instead of flood",
    )
    subparsers = parser.add_subparsers(dest="command")
    subparsers.add_parser("locations", help="list demo locations")
    subparsers.add_parser("thresholds", help="print every threshold and weight")
    subparsers.add_parser("scenarios", help="list synthetic demo scenarios")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    location = DEMO_LOCATIONS[args.location]

    if args.command == "locations":
        _print_locations()
        return 0
    if args.command == "thresholds":
        _print_thresholds()
        return 0
    if args.command == "scenarios":
        _print_scenarios()
        return 0

    if args.earthquake:
        print(json.dumps(run_earthquake_demo(), indent=2, default=str))
        return 0

    if args.offline:
        print(
            "OFFLINE MODE: using SYNTHETIC demo data. This is not live data.\n",
            file=sys.stderr,
        )
        event = run_flood_offline(location, args.scenario)
    elif args.fallback_synthetic:
        event = run_flood_with_fallback(location, args.scenario)
    else:
        event = run_flood_live(location)

    if args.json:
        print(json.dumps(event.to_dict(), indent=2))
    else:
        print_event(event)

    # Non-zero exit when there was nothing to assess, so a scripted demo run
    # cannot quietly succeed on total data loss.
    return 0 if event.data_quality.origin != "none" else 1


if __name__ == "__main__":
    raise SystemExit(main())
