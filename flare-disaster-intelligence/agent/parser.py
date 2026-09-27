"""Deterministic free-text parsing in front of the agent.

WHAT THIS IS
------------
The smallest thing that lets a person type a sentence instead of filling in a
form::

    "Check flood risk at 27.7172, 85.3240"   ->   IntelligenceRequest

It extracts exactly three things - ``disaster_type``, ``latitude`` and
``longitude`` - and hands back the **existing**
:class:`~agent.tool.IntelligenceRequest`. Everything downstream is unchanged:
:func:`agent.agent.handle_request` -> :func:`agent.tool.run_intelligence_tool` ->
the Milestone 1 pipeline.

WHAT THIS IS NOT
----------------
* **Not natural-language understanding.** There is no model, no grammar and no
  inference. A handful of regular expressions, applied in a fixed order, produce
  the same answer every time. ``check FLOOD RISK at 27.7172, 85.3240`` and
  ``ChEcK fLoOd RiSk At 27.7172, 85.3240`` are the same input.
* **Not an intelligence system.** It does not rank, score, validate, complete or
  guess. It extracts three fields and stops.
* **Not geocoding.** It cannot turn "Kathmandu" into coordinates and does not
  try. A place name is simply not a number, so the location comes back missing
  and the agent asks for a coordinate.
* **Not a second validation layer.** Coordinate *validity* is not checked here at
  all. ``100.7172`` is extracted faithfully and handed to
  :class:`~schemas.events.Location`, which already rejects it. The parser only
  guarantees that what it emits is *a number*, never a plausible-looking
  non-number.

Two rules decide every ambiguous case
------------------------------------
**A hazard word is only recognised from a fixed lexicon.** Words not in the
lexicon are not "probably a disaster" - they are simply not a disaster type, so
the agent asks. When several hazard words appear, the **first one in the
sentence** wins, because that is how a person reads it: "Is there a flood risk
near the fire station?" is a flood question, while "check wildfire or flood"
is a wildfire question.

**Coordinates must be exactly two numbers, in latitude-then-longitude order.**
One number is not enough to tell which axis it belongs to, and three or more is
ambiguous, so both cases produce *no* location and the agent asks again. Guessing
either one would mean reporting a risk score for a place the user never named.
"""

from __future__ import annotations

import math
import re

from agent.agent import AgentReply, handle_request
from agent.tool import DEFAULT_SCENARIO, IntelligenceRequest, RequestMode

#: Hazard words the parser recognises, mapped to the canonical disaster-type
#: string that flows into ``IntelligenceRequest.disaster_type``.
#:
#: The first element of each tuple is a regex matched case-insensitively; the
#: second is the canonical value. Only ``flood`` is actually *supported* - the
#: rest are recognised precisely so the tool can refuse them by name instead of
#: the agent asking a pointless follow-up question. Support is decided by
#: :data:`agent.tool.SUPPORTED_DISASTER_TYPES`, never here.
#:
#: Order is irrelevant: the earliest match in the sentence wins, and ties at the
#: same offset are broken by preferring the longer pattern, so "storm surge"
#: beats a bare "storm".
HAZARD_LEXICON: tuple[tuple[str, str], ...] = (
    (r"flood(?:ing|ed|s)?", "flood"),
    (r"flash\s*floods?", "flood"),
    (r"earthquakes?", "earthquake"),
    (r"\bquakes?\b", "earthquake"),
    (r"seismic", "earthquake"),
    (r"landslides?", "landslide"),
    (r"land\s*slips?", "landslide"),
    (r"wildfires?", "wildfire"),
    (r"forest\s*fires?", "wildfire"),
    (r"\bfires?\b", "wildfire"),
    (r"cyclones?", "cyclone"),
    (r"hurricanes?", "hurricane"),
    (r"typhoons?", "typhoon"),
    (r"storm\s*surges?", "storm_surge"),
    (r"storms?", "storm"),
    (r"tsunamis?", "tsunami"),
    (r"avalanches?", "avalanche"),
    (r"drought", "drought"),
    (r"hail(?:stones?|storm)?", "hail"),
    (r"snowstorms?", "snowstorm"),
    (r"blizzards?", "blizzard"),
    (r"heat\s*waves?", "heat_wave"),
    (r"cold\s*waves?", "cold_wave"),
    (r"tornadoe?s?", "tornado"),
    (r"volcan(?:o|es|ic)", "volcano"),
)

#: A signed decimal literal, e.g. ``27.7172``, ``-12.3456``, ``85``, ``+5``.
#:
#: The lookarounds are what keep this from matching numbers embedded in
#: identifiers: ``v1.5`` and ``abc123`` are rejected because the literal is
#: preceded or followed by a word character or a dot. A three-part version like
#: ``3.4.5`` is also rejected outright, because no prefix of it can satisfy the
#: trailing lookahead - so it yields no number at all rather than a confident
#: wrong one.
#:
#: Scientific notation (``1e400``) does not match, and neither do ``nan``,
#: ``inf`` or ``infinity``, so a user cannot smuggle a non-finite value through
#: as if it were a coordinate.
_NUMBER_PATTERN = re.compile(r"(?<![\w.])[-+]?(?:\d+\.\d+|\d+)(?![\w.])")

#: Number of numbers that constitutes a usable coordinate pair.
_EXPECTED_COORDINATES = 2


def parse_user_input(
    text: str,
    *,
    mode: RequestMode = "live",
    scenario: str = DEFAULT_SCENARIO,
) -> IntelligenceRequest:
    """Turn one line of free text into an :class:`IntelligenceRequest`.

    Never raises and never guesses: anything it cannot read with confidence
    comes back as ``None``, which the agent already knows how to ask about.

    Parameters
    ----------
    text:
        The user's sentence. Case is irrelevant; surrounding whitespace is
        ignored. An empty value - or anything that is not a string, which a
        JSON or chat transport can hand you - yields an all-``None`` request,
        which the agent answers with a question rather than a traceback.
    mode, scenario:
        Passed through untouched, so the caller decides live vs offline. The
        parser has no opinion about where the data comes from.
    """
    stripped = text.strip() if isinstance(text, str) else ""
    latitude, longitude = _extract_coordinates(stripped)
    return IntelligenceRequest(
        disaster_type=_extract_hazard(stripped),
        latitude=latitude,
        longitude=longitude,
        mode=mode,
        scenario=scenario,
    )


def handle_text(
    text: str,
    *,
    mode: RequestMode = "live",
    scenario: str = DEFAULT_SCENARIO,
) -> AgentReply:
    """Free text straight to a reply: parse, then reuse the existing agent.

    This is the whole integration. There is no separate reasoning path for typed
    input, so a sentence and an equivalent structured request produce the same
    assessment and the same wording.
    """
    return handle_request(parse_user_input(text, mode=mode, scenario=scenario))


def _extract_hazard(text: str) -> str | None:
    """Return the canonical disaster type named first in the sentence.

    ``None`` when the text names no hazard the lexicon knows, which is the
    common case for a request like "what is the weather like" - and correctly
    so, because a question with no disaster type in it is a question the agent
    should ask back.
    """
    best: tuple[int, int, str] | None = None
    for pattern, disaster_type in HAZARD_LEXICON:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            # Earlier in the sentence wins; at the same offset, the longer
            # pattern wins, so "storm surge" is not read as "storm".
            candidate = (match.start(), -(match.end() - match.start()), disaster_type)
            if best is None or candidate < best:
                best = candidate
    return best[2] if best else None


def _extract_coordinates(text: str) -> tuple[float | None, float | None]:
    """Return ``(latitude, longitude)``, or ``(None, None)`` if not a clean pair.

    The count has to be exactly two, in latitude-then-longitude order. One
    number cannot be attributed to an axis, and more than two is ambiguous; in
    both cases the honest result is *no* location, so the agent asks for a
    coordinate instead of reporting a risk for the wrong point.
    """
    values: list[float] = []
    for match in _NUMBER_PATTERN.finditer(text):
        value = float(match.group())
        # Belt and braces: the pattern cannot produce these, but a non-finite
        # coordinate must never reach the request as though it were a location.
        if not math.isfinite(value):
            continue
        values.append(value)

    if len(values) != _EXPECTED_COORDINATES:
        return None, None
    return values[0], values[1]


def describe_parsing() -> dict[str, object]:
    """What the parser recognises, in one serialisable dict.

    An extractor with an unstated vocabulary is one that will be misused, so
    the lexicon is published rather than implied.
    """
    return {
        "parser": "deterministic_regex",
        "uses_language_model": False,
        "extracts": ["disaster_type", "latitude", "longitude"],
        "recognised_disaster_types": sorted(
            {disaster_type for _, disaster_type in HAZARD_LEXICON}
        ),
        "geocoding": False,
        "coordinate_order": "latitude_then_longitude",
        "coordinate_rule": (
            "exactly two numbers; one number or three or more yields no location "
            "and the agent asks again"
        ),
        "multiple_hazards_rule": "the first hazard word in the sentence wins",
        "invalid_coordinates": (
            "not checked here; extracted faithfully and rejected by the existing "
            "Location validation"
        ),
    }
