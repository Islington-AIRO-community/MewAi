"""Minimal agent-facing tool contract for the FLARE Disaster Intelligence Layer.

WHAT THIS IS
------------
A thin, deterministic seam that lets an agent ask the existing flood pipeline
for intelligence about a point on the map, without ever touching the flood-risk
implementation. The agent names a disaster type and a coordinate; this module
validates the request, calls the pipeline, and hands back the **existing**
:class:`~schemas.events.IntelligenceEvent`.

WHAT THIS IS NOT
----------------
* **Not a second event schema.** On success the tool returns a real
  ``IntelligenceEvent``, built by the unchanged Milestone 1 pipeline. The
  response envelope here carries only a status and a question; it never
  re-describes the intelligence result.
* **Not a risk model.** Nothing here computes, rescales or interprets a score.
  Indicator arithmetic stays in :mod:`risk.flood`.
* **Not geocoding.** A request is addressed by coordinate only. There is no
  place name, no address lookup and no admin-area resolution. See
  :func:`coordinate_label` for what fills the contract's required ``name``.
* **Not a new transport.** No HTTP, no sockets, no LLM. It is a plain function,
  which is what makes it testable without a network.

Failure policy
--------------
A *request* problem (missing type, missing or impossible coordinates, an
unsupported disaster, an unknown scenario) is returned as a structured status,
because an agent needs to be able to ask the user a follow-up question. A
*data* problem is not handled here at all: the pipeline records source failures
and returns a normal assessment whose ``data_quality`` shows what happened, and
this tool passes that assessment through untouched.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ValidationError

from demo.fixtures import DEFAULT_SCENARIO, ScenarioNotFound
from main import run_flood_live, run_flood_offline
from schemas.events import EARTHQUAKE, FLOOD, IntelligenceEvent, Location

#: Disaster types this tool can actually answer, right now.
#:
#: Only ``flood`` qualifies, because ``flood`` is the only path that produces a
#: real :class:`IntelligenceEvent`. The repository *does* contain an earthquake
#: path (:func:`risk.earthquake.assess_earthquake`), but it returns a bare
#: ``dict`` with a different field set and no contract version, so routing an
#: agent to it would mean inventing a second, competing result shape. It is
#: therefore reported as unsupported rather than silently served.
SUPPORTED_DISASTER_TYPES: frozenset[str] = frozenset({FLOOD})

#: Closed outcome vocabulary. Mirrors the run-level ``data_quality.origin``
#: style already used in :mod:`schemas.events`: a typo cannot become a status
#: that downstream code has never seen.
ToolStatus = Literal[
    #: The pipeline ran; ``event`` holds the intelligence result.
    "ok",
    #: No disaster type was given, so there is nothing to look up yet.
    "missing_disaster_type",
    #: Latitude and/or longitude were not given.
    "missing_location",
    #: Coordinates were given but are impossible (out of range or not finite).
    "invalid_location",
    #: A disaster type was given, but this repository cannot answer it yet.
    "unsupported_disaster",
    #: ``mode="offline"`` named a synthetic scenario that does not exist.
    "invalid_scenario",
]

#: How the intelligence should be sourced. Both modes already existed in the
#: CLI, so the tool exposes exactly those two and nothing new.
RequestMode = Literal["live", "offline"]


class IntelligenceRequest(BaseModel):
    """One agent request for disaster intelligence.

    Every field except ``mode`` and ``scenario`` is optional on purpose: the
    agent needs to be able to send a half-finished request and be told what to
    ask for, rather than have the request rejected wholesale.

    Coordinates are intentionally *not* range-constrained here. Bounds are
    enforced by :class:`~schemas.events.Location` when the request is turned
    into a location, so there is exactly one definition of "a valid coordinate"
    in the repository. The result is that an impossible coordinate comes back as
    an ``invalid_location`` status the agent can act on, instead of a pydantic
    error it cannot interpret.
    """

    #: e.g. ``"flood"``. Free text on purpose, so an unsupported value is
    #: reported as such rather than being coerced into a supported one.
    disaster_type: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    #: ``"live"`` calls the public APIs; ``"offline"`` uses a labelled synthetic
    #: scenario and touches no network.
    mode: RequestMode = "live"
    #: Synthetic scenario used when ``mode="offline"``.
    scenario: str = DEFAULT_SCENARIO

    @property
    def has_location(self) -> bool:
        """True when both coordinates were supplied."""
        return self.latitude is not None and self.longitude is not None


class IntelligenceResponse(BaseModel):
    """The tool's answer: a status, and the existing event when there is one.

    ``status="ok"`` always carries ``event``. Every other status carries
    ``event=None`` plus a ``next_question`` the agent can put to the user.
    """

    status: ToolStatus
    #: The unmodified Milestone 1 output contract. Never a copy, never reshaped.
    event: IntelligenceEvent | None = None
    #: What the agent should ask the user next, when the request is incomplete.
    next_question: str | None = None
    #: Machine-readable explanation, for logs and for the agent's own reasoning.
    detail: str | None = None

    @property
    def ok(self) -> bool:
        """True when the pipeline ran and produced an assessment."""
        return self.status == "ok" and self.event is not None


def coordinate_label(latitude: float, longitude: float) -> str:
    """A human-legible label for a coordinate pair.

    The output contract requires ``Location.name``. Resolving a coordinate to a
    real place name is **geocoding**, which this milestone deliberately does not
    do, and inventing a name would be worse than admitting we have only a
    coordinate. So the label is the coordinate itself, which is honest and
    round-trips.

    A consequence worth knowing: ``Location.country`` still defaults to
    ``"Nepal"`` because that field predates the arbitrary-coordinate decision.
    An assessment of a point outside Nepal therefore carries a country that is
    wrong. Fixing it means changing the published contract, so it is reported
    rather than silently patched.
    """
    return f"{latitude:.4f}, {longitude:.4f}"


def build_location(latitude: float, longitude: float) -> Location:
    """Turn a validated coordinate pair into the contract's ``Location``.

    Raises
    ------
    pydantic.ValidationError
        If the coordinates are outside the contract's bounds or are not finite.
        Callers should let :func:`run_intelligence_tool` convert that into an
        ``invalid_location`` status rather than handling it themselves.
    """
    return Location(
        name=coordinate_label(latitude, longitude),
        latitude=latitude,
        longitude=longitude,
    )


def run_intelligence_tool(request: IntelligenceRequest) -> IntelligenceResponse:
    """Answer one request by calling the existing flood pipeline.

    This is the whole tool. It performs no reasoning, calls no model, and never
    touches :mod:`risk.flood` directly -- it goes through
    :func:`main.run_flood_live` / :func:`main.run_flood_offline`, which are the
    same entry points the CLI and the HTTP API already use.

    On success the returned ``event`` is a genuine ``IntelligenceEvent``, with
    location, risk score, threat level, alert decision, data quality, provenance,
    warnings and evidence all intact.

    A data-source failure is *not* an error status: the pipeline already reports
    that honestly through ``event.data_quality``, and re-reporting it here would
    hide it behind a second, contradictory status.
    """
    # 1. Disaster type present? A terminal condition is reported before asking
    #    for anything else, because no amount of extra input will change it.
    if request.disaster_type is None or not request.disaster_type.strip():
        return IntelligenceResponse(
            status="missing_disaster_type",
            next_question="Which disaster type should I check?",
            detail="no disaster type was supplied",
        )

    requested_type = request.disaster_type.strip().lower()
    if requested_type not in SUPPORTED_DISASTER_TYPES:
        return IntelligenceResponse(
            status="unsupported_disaster",
            next_question=(
                f"I cannot assess {requested_type!r}. "
                f"Supported types: {', '.join(sorted(SUPPORTED_DISASTER_TYPES))}."
            ),
            detail=_unsupported_detail(requested_type),
        )

    # 2. Location present? Partial input is treated as absent: half a coordinate
    #    cannot be sent to a collector.
    if not request.has_location:
        return IntelligenceResponse(
            status="missing_location",
            next_question="Which location should I check? Send a latitude and a longitude.",
            detail=_missing_detail(request),
        )

    # 3. Location usable? Delegated to Location, which owns the bounds.
    try:
        location = build_location(request.latitude, request.longitude)
    except ValidationError as exc:
        return IntelligenceResponse(
            status="invalid_location",
            next_question=(
                f"{request.latitude}, {request.longitude} is not a real location. "
                "Send a latitude between -90 and 90 and a longitude between "
                "-180 and 180."
            ),
            detail=_validation_detail(exc),
        )

    # 4. Run the pipeline. Only the flood path exists in the contract.
    if request.mode == "offline":
        try:
            event = run_flood_offline(location, request.scenario)
        except ScenarioNotFound as exc:
            return IntelligenceResponse(
                status="invalid_scenario",
                next_question=(
                    f"Unknown synthetic scenario {request.scenario!r}. "
                    "Run with mode='live' for live data."
                ),
                detail=str(exc),
            )
    else:
        event = run_flood_live(location)

    return IntelligenceResponse(status="ok", event=event)


def describe_capabilities() -> dict[str, Any]:
    """What this tool can and cannot do, in one serialisable dict.

    A tool contract an agent cannot inspect is a tool contract it will misuse.
    The unsupported half matters as much as the supported half.
    """
    return {
        "tool": "flare_disaster_intelligence",
        "contract_version_of_results": "1.0.0",
        "supported_disaster_types": sorted(SUPPORTED_DISASTER_TYPES),
        "modes": ["live", "offline"],
        "location_representation": "coordinates",
        "geocoding": False,
        "free_text_parsing": False,
        "request_schema": IntelligenceRequest.model_json_schema(),
        "response_schema": IntelligenceResponse.model_json_schema(),
        "notes": [
            "Results are the existing IntelligenceEvent contract, unmodified.",
            "Data-source failures are reported inside data_quality, not as a "
            "tool error.",
            "Location.country still defaults to 'Nepal' for every coordinate.",
        ],
    }


def _unsupported_detail(disaster_type: str) -> str:
    """Explain *why* a type is unsupported, honestly and specifically."""
    if disaster_type == EARTHQUAKE:
        return (
            "the repository has an earthquake prototype, but "
            "risk.earthquake.assess_earthquake returns a bare dict rather than an "
            "IntelligenceEvent, so serving it would require a second, competing "
            "result schema"
        )
    return (
        f"this repository implements only "
        f"{', '.join(sorted(SUPPORTED_DISASTER_TYPES))} intelligence"
    )


def _missing_detail(request: IntelligenceRequest) -> str:
    """Name exactly which coordinate half is missing."""
    if request.latitude is None and request.longitude is None:
        return "neither latitude nor longitude was supplied"
    absent = "latitude" if request.latitude is None else "longitude"
    return f"{absent} was supplied without the other coordinate"


def _validation_detail(exc: ValidationError) -> str:
    """Flatten pydantic's location errors into one short, loggable string."""
    parts = []
    for error in exc.errors():
        field = ".".join(str(item) for item in error.get("loc", ())) or "location"
        parts.append(f"{field}: {error.get('msg', 'invalid')}")
    return "; ".join(parts)
