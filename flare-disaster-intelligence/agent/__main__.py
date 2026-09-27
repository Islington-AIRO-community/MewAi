"""Runnable demonstration of the Milestone 2 agent/tool contract.

    python -m agent                              offline, Kathmandu
    python -m agent --lat 27.7172 --lon 85.3240  offline, your own point
    python -m agent --live                       against the real public APIs
    python -m agent --scenario severe            offline, a different scenario
    python -m agent --json                       print the full reply as JSON

    python -m agent --text "Check flood risk at 27.7172, 85.3240"
    python -m agent --text "check earthquake risk at 27.7172, 85.3240"
    python -m agent --text "what is the flood risk" --live

This is a demonstration harness, not part of the contract. It exists so the
whole path -- agent, tool, pipeline, IntelligenceEvent, agent -- can be seen in
one command, with no HTTP server, no API key and no language model involved.

It defaults to ``--offline`` deliberately. A demo that needs a hotel wifi
connection can only fail, and a synthetic result is labelled as such in the
output rather than passed off as live.

``--text`` routes the sentence through the deterministic free-text parser
instead of the individual flags. Every other flag behaves exactly as it did
before ``--text`` existed.
"""

from __future__ import annotations

import argparse
import json
import sys

from agent.agent import handle_request
from agent.parser import handle_text
from agent.tool import DEFAULT_SCENARIO, IntelligenceRequest, describe_capabilities

DEMO_LAT = 27.7172
DEMO_LON = 85.3240


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m agent",
        description="Demonstrate the FLARE agent-facing disaster intelligence tool.",
    )
    parser.add_argument("--lat", type=float, default=DEMO_LAT, help="latitude")
    parser.add_argument("--lon", type=float, default=DEMO_LON, help="longitude")
    parser.add_argument(
        "--type",
        dest="disaster_type",
        default="flood",
        help="disaster type to request (only 'flood' is supported today)",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="call the real public APIs instead of the synthetic fixtures",
    )
    parser.add_argument(
        "--scenario",
        default=DEFAULT_SCENARIO,
        help=f"synthetic scenario for offline mode (default: {DEFAULT_SCENARIO})",
    )
    parser.add_argument("--json", action="store_true", help="print the reply as JSON")
    parser.add_argument(
        "--text",
        default=None,
        help=(
            "parse a free-text request instead of using the individual flags, "
            'e.g. --text "Check flood risk at 27.7172, 85.3240"'
        ),
    )
    parser.add_argument(
        "--capabilities",
        action="store_true",
        help="print what this tool supports, and print nothing else",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.capabilities:
        print(json.dumps(describe_capabilities(), indent=2))
        return 0

    mode = "live" if args.live else "offline"
    if not args.live:
        print("OFFLINE: synthetic demo data, not a live observation.\n", file=sys.stderr)

    if args.text is not None:
        # The sentence decides disaster type and location; --lat/--lon/--type are
        # not consulted, because a caller who typed a coordinate means it.
        reply = handle_text(args.text, mode=mode, scenario=args.scenario)
        source = f"{mode} mode, parsed from free text"
        request = f'{args.text!r}'
    else:
        request = IntelligenceRequest(
            disaster_type=args.disaster_type,
            latitude=args.lat,
            longitude=args.lon,
            mode=mode,
            scenario=args.scenario,
        )
        reply = handle_request(request)
        source = (
            f"{mode} mode, disaster_type={args.disaster_type!r}, "
            f"lat={args.lat}, lon={args.lon}"
        )

    if args.json:
        print(json.dumps(reply.model_dump(mode="json"), indent=2))
    else:
        print("=" * 72)
        print(f"TOOL : {source}")
        print("=" * 72)
        print(f"AGENT: {reply.message}")

    # 0 = answered, 1 = the agent needs something from the user,
    # 2 = answered but the pipeline had no usable data.
    if reply.status != "ok":
        return 1
    if reply.event is not None and reply.event.data_quality.origin == "none":
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
