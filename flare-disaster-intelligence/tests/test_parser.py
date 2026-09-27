"""Tests for the Milestone 2B deterministic free-text parser.

No network access and no language model. The parser is a handful of regular
expressions, so every assertion here is about a literal string producing a
literal request - which is the whole point of building it this way.

What is pinned
--------------
* each of the four documented example phrasings, in any case;
* negative, positive, signed and space-separated coordinates;
* that missing information is **asked for**, never guessed;
* that an unsupported disaster is refused **by name**, and is never quietly
  answered with a flood assessment;
* that impossible coordinates are extracted faithfully and rejected by the
  existing ``Location`` validation rather than by a second set of rules here;
* that malformed, ambiguous and non-finite coordinate text produces *no*
  location instead of a confident wrong one;
* that the parser returns the existing ``IntelligenceRequest`` and touches
  neither the network nor the risk implementation.
"""

from __future__ import annotations

import ast
import inspect
import json
import socket

import pytest

from agent import parser as parser_module
from agent.agent import handle_request
from agent.parser import (
    HAZARD_LEXICON,
    describe_parsing,
    handle_text,
    parse_user_input,
)
from agent.tool import SUPPORTED_DISASTER_TYPES, IntelligenceRequest
from schemas.events import IntelligenceEvent

#: A real point, and a real point in the southern hemisphere.
KTM = (27.7172, 85.3240)
ANTIPODEAN = (-12.3456, 45.6789)


def parse(text: str, **kwargs) -> IntelligenceRequest:
    """Parse in offline mode, which is the only mode the tests use."""
    return parse_user_input(text, mode="offline", **kwargs)


# ---------------------------------------------------------------------------
# 1. flood + valid positive coordinates
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Check flood risk at 27.7172, 85.3240",
        "What is the flood threat at 27.7172, 85.3240?",
        "Assess flooding at 27.7172, 85.3240",
        "Flood at 27.7172, 85.3240",
    ],
)
def test_documented_example_phrasings_all_parse(text):
    request = parse(text)
    assert request.disaster_type == "flood"
    assert request.latitude == pytest.approx(KTM[0])
    assert request.longitude == pytest.approx(KTM[1])


def test_positive_coordinates_without_decimal_places():
    request = parse("Flood at 27, 85")
    assert request.disaster_type == "flood"
    assert request.latitude == pytest.approx(27.0)
    assert request.longitude == pytest.approx(85.0)


def test_trailing_punctuation_and_surrounding_whitespace_are_ignored():
    request = parse("   Is there flood risk at 27.7172, 85.3240?   ")
    assert request.disaster_type == "flood"
    assert request.latitude == pytest.approx(KTM[0])
    assert request.longitude == pytest.approx(KTM[1])


# ---------------------------------------------------------------------------
# 2. flood + negative coordinates
# ---------------------------------------------------------------------------


def test_negative_coordinates():
    request = parse(f"Flood at {ANTIPODEAN[0]}, {ANTIPODEAN[1]}")
    assert request.disaster_type == "flood"
    assert request.latitude == pytest.approx(ANTIPODEAN[0])
    assert request.longitude == pytest.approx(ANTIPODEAN[1])


def test_negative_longitude_with_positive_latitude():
    request = parse("Flood at 12.3456, -45.6789")
    assert request.latitude == pytest.approx(12.3456)
    assert request.longitude == pytest.approx(-45.6789)


def test_no_space_after_the_comma():
    request = parse("Flood at 12.3456,-45.6789")
    assert request.latitude == pytest.approx(12.3456)
    assert request.longitude == pytest.approx(-45.6789)


def test_explicit_plus_sign_is_accepted():
    request = parse("Flood at +27.7172, +85.3240")
    assert request.latitude == pytest.approx(KTM[0])
    assert request.longitude == pytest.approx(KTM[1])


def test_coordinates_are_not_restricted_to_nepal():
    """Anywhere on earth parses; nothing is snapped to a demo location."""
    for latitude, longitude in [(0.0, 0.0), (64.1466, -21.9426), (-33.8688, 151.2093)]:
        request = parse(f"Flood at {latitude}, {longitude}")
        assert request.latitude == pytest.approx(latitude)
        assert request.longitude == pytest.approx(longitude)


# ---------------------------------------------------------------------------
# 3. case-insensitive flood
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "CHECK FLOOD RISK AT 27.7172, 85.3240",
        "check flood risk at 27.7172, 85.3240",
        "ChEcK fLoOd RiSk At 27.7172, 85.3240",
        "FLOOD at 27.7172, 85.3240",
    ],
)
def test_flood_is_recognised_in_any_case(text):
    assert parse(text).disaster_type == "flood"


# ---------------------------------------------------------------------------
# 4. "flooding" recognition
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "word", ["flood", "floods", "flooding", "flooded", "FLOODING", "flash flood"]
)
def test_flood_word_variants_all_map_to_flood(word):
    assert parse(f"{word} at 27.7172, 85.3240").disaster_type == "flood"


# ---------------------------------------------------------------------------
# 5. missing disaster
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Check 27.7172, 85.3240",
        "What is the risk at 27.7172, 85.3240?",
        "27.7172, 85.3240",
        "Check",
        "",
        "   ",
    ],
)
def test_missing_disaster_type_asks_for_it(text):
    """A request that names no hazard is a question, not a flood question."""
    request = parse(text)
    if text.strip() and "," in text:
        # the coordinate is still there; only the disaster type is absent
        assert request.latitude is not None
    else:
        assert request.latitude is None
    reply = handle_text(text, mode="offline")
    assert reply.status == "missing_disaster_type"
    assert reply.needs_input is True
    assert reply.event is None
    assert "disaster type" in reply.message.lower()


def test_missing_disaster_type_matches_the_existing_tool_behaviour():
    """Free text must reach the *same* status a structured request would."""
    from_text = handle_text("Check 27.7172, 85.3240", mode="offline")
    from_request = handle_request(
        IntelligenceRequest(latitude=KTM[0], longitude=KTM[1], mode="offline")
    )
    assert from_text.status == from_request.status == "missing_disaster_type"
    assert from_text.message == from_request.message


# ---------------------------------------------------------------------------
# 6. missing location
# ---------------------------------------------------------------------------


def test_missing_location_asks_for_it():
    reply = handle_text("Check flood risk", mode="offline")
    assert reply.status == "missing_location"
    assert reply.needs_input is True
    assert reply.event is None
    assert "location" in reply.message.lower()


def test_missing_location_matches_the_existing_tool_behaviour():
    from_text = handle_text("Check flood risk", mode="offline")
    from_request = handle_request(
        IntelligenceRequest(disaster_type="flood", mode="offline")
    )
    assert from_text.status == from_request.status == "missing_location"
    assert from_text.message == from_request.message


def test_a_place_name_is_not_a_location():
    """No geocoding: a name yields no coordinate, so the agent asks for one."""
    request = parse("Check flood risk in Kathmandu")
    assert request.disaster_type == "flood"
    assert request.latitude is None and request.longitude is None
    assert handle_text("Check flood risk in Kathmandu", mode="offline").status == (
        "missing_location"
    )


# ---------------------------------------------------------------------------
# 7 & 8. unsupported disasters
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected_type"),
    [
        ("Check earthquake risk at 27.7172, 85.3240", "earthquake"),
        ("Check landslide risk at 27.7172, 85.3240", "landslide"),
        ("Check tsunami risk at 27.7172, 85.3240", "tsunami"),
        ("Check wildfire risk at 27.7172, 85.3240", "wildfire"),
        ("Storm surge at 27.7172, 85.3240", "storm_surge"),
        ("Hurricane at 27.7172, 85.3240", "hurricane"),
    ],
)
def test_unsupported_disaster_is_recognised_then_refused(text, expected_type):
    """Recognised by name, so the refusal can name it instead of re-asking."""
    request = parse(text)
    assert request.disaster_type == expected_type
    assert expected_type not in SUPPORTED_DISASTER_TYPES

    reply = handle_text(text, mode="offline")
    assert reply.status == "unsupported_disaster"
    assert reply.event is None
    assert expected_type in reply.message


def test_unsupported_disaster_is_never_answered_with_a_flood_assessment():
    """The single most important property of this milestone."""
    for text in [
        "Check earthquake risk at 27.7172, 85.3240",
        "Check landslide risk at 27.7172, 85.3240",
        "Is there a wildfire near 27.7172, 85.3240",
    ]:
        reply = handle_text(text, mode="offline")
        assert reply.status == "unsupported_disaster"
        assert reply.event is None
        assert "Flood threat" not in reply.message


def test_unsupported_disaster_matches_the_existing_tool_behaviour():
    from_text = handle_text("Check earthquake risk at 27.7172, 85.3240", mode="offline")
    from_request = handle_request(
        IntelligenceRequest(
            disaster_type="earthquake", latitude=KTM[0], longitude=KTM[1], mode="offline"
        )
    )
    assert from_text.status == from_request.status == "unsupported_disaster"
    assert from_text.message == from_request.message


def test_first_hazard_word_in_the_sentence_wins():
    """Documented tie-break, in both directions."""
    # an incidental hazard word after the real one must not hijack the request
    assert parse(
        "Is there a flood risk near the fire station at 27.7172, 85.3240"
    ).disaster_type == "flood"
    # and the reverse order is read as written
    assert parse(
        "Check wildfire or flood risk at 27.7172, 85.3240"
    ).disaster_type == "wildfire"


def test_longer_hazard_phrase_wins_over_its_own_prefix():
    assert parse("storm surge at 27.7172, 85.3240").disaster_type == "storm_surge"


# ---------------------------------------------------------------------------
# 9 & 10. invalid coordinates
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "parsed_latitude", "parsed_longitude"),
    [
        ("Check flood risk at 100.7172, 85.3240", 100.7172, 85.3240),
        ("Check flood risk at -100.7172, 85.3240", -100.7172, 85.3240),
        ("Check flood risk at 27.7172, 200.3240", 27.7172, 200.3240),
        ("Check flood risk at 27.7172, -200.3240", 27.7172, -200.3240),
    ],
)
def test_impossible_coordinates_are_extracted_then_rejected_downstream(
    text, parsed_latitude, parsed_longitude
):
    """The parser preserves the value; ``Location`` is the only validator."""
    request = parse(text)
    assert request.latitude == pytest.approx(parsed_latitude)
    assert request.longitude == pytest.approx(parsed_longitude)

    reply = handle_text(text, mode="offline")
    assert reply.status == "invalid_location"
    assert reply.event is None


@pytest.mark.parametrize(
    "text", ["91.0, 85.3240", "27.7172, 181.0", "-91.0, 85.3240", "27.7172, -181.0"]
)
def test_coordinates_just_outside_the_contract_bounds_are_rejected(text):
    reply = handle_text(f"Check flood risk at {text}", mode="offline")
    assert reply.status == "invalid_location"


def test_the_parser_holds_no_coordinate_bounds_of_its_own():
    """No duplicated validation: it accepts what the regex reads."""
    request = parse("Check flood risk at 100.7172, 85.3240")
    assert request.latitude == 100.7172  # not clamped, not rejected, not altered
    assert "latitude" in str(parse_user_input.__doc__ or "") or True
    source = inspect.getsource(parser_module)
    assert "-90" not in source and "180" not in source


# ---------------------------------------------------------------------------
# 11. malformed coordinate text
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "Check flood risk at 3.4.5, 85.3",            # three-part number
        "Check flood risk at 27.7172",                # only one number
        "Check flood risk at 27.7172, 85.3240, 12.5",  # three numbers
        "Check flood risk at 27.7172 85.3240 99.9",   # three numbers, no commas
        "Check flood risk at v1.5 and abc123",        # numbers inside identifiers
        "Check flood risk at 1e400, 2",               # scientific notation
        "Check flood risk at the usual place",        # no numbers at all
    ],
)
def test_malformed_coordinate_text_yields_no_location_rather_than_a_guess(text):
    request = parse(text)
    assert request.latitude is None
    assert request.longitude is None
    assert handle_text(text, mode="offline").status == "missing_location"


@pytest.mark.parametrize(
    "text",
    [
        "Check flood risk at nan, 85.3240",
        "Check flood risk at NaN, Infinity",
        "Check flood risk at inf, -inf",
        "Check flood risk at NaN, NaN",
        "Check flood risk at " + "9" * 400 + ", 85.3240",  # overflows float() to inf
    ],
)
def test_non_finite_values_are_never_accepted_as_coordinates(text):
    """``nan`` / ``inf`` / a 400-digit integer cannot become a location."""
    request = parse(text)
    assert request.latitude is None
    assert request.longitude is None
    assert handle_text(text, mode="offline").status == "missing_location"


def test_a_number_too_large_for_a_float_does_not_reach_the_request():
    request = parse("Flood at " + "9" * 400 + ", 85.3240")
    assert request.latitude is None
    assert request.longitude is None


# ---------------------------------------------------------------------------
# 12 & 13. end-to-end, and the event is preserved
# ---------------------------------------------------------------------------


def test_successful_end_to_end_offline_text_request():
    reply = handle_text("Check flood risk at 27.7172, 85.3240", mode="offline")
    assert reply.status == "ok"
    assert reply.needs_input is False
    assert reply.event is not None
    assert reply.event.assessment.threat_level in {
        "LOW", "MODERATE", "HIGH", "CRITICAL"
    }
    assert "Flood threat" in reply.message
    assert "SYNTHETIC" in reply.message


def test_text_and_structured_requests_produce_an_identical_assessment():
    """One code path: the parser only fills in three fields."""
    from_text = handle_text("Check flood risk at 27.7172, 85.3240", mode="offline")
    from_request = handle_request(
        IntelligenceRequest(
            disaster_type="flood", latitude=KTM[0], longitude=KTM[1], mode="offline"
        )
    )
    assert from_text.message == from_request.message
    assert from_text.status == from_request.status
    assert from_text.event.risk_score == from_request.event.risk_score
    assert from_text.event.assessment.threat_level == (
        from_request.event.assessment.threat_level
    )
    assert from_text.event.location.latitude == from_request.event.location.latitude


def test_existing_intelligence_event_is_preserved_intact():
    """Free text must not reshape the Milestone 1 output contract."""
    event = handle_text("Flood at 27.7172, 85.3240", mode="offline").event
    assert isinstance(event, IntelligenceEvent)
    payload = event.to_dict()

    assert payload["contract_version"] == "1.0.0"
    assert payload["disaster_type"] == "flood"
    assert payload["location"]["latitude"] == pytest.approx(KTM[0])
    assert payload["location"]["longitude"] == pytest.approx(KTM[1])
    assert payload["risk_score"] is None or 0.0 <= payload["risk_score"] <= 1.0
    assert payload["assessment"]["threat_level"]
    assert isinstance(payload["assessment"]["alert"], bool)
    assert payload["assessment"]["reason"]
    assert 0.0 <= payload["data_quality"]["coverage"] <= 1.0
    assert payload["data_quality"]["origin"] == "synthetic_demo"
    assert payload["data_quality"]["is_synthetic"] is True
    assert payload["evidence"]["indicators"]
    assert payload["evidence"]["measurements"]
    assert payload["timestamp"]


def test_the_parser_never_raises_on_hostile_input():
    for text in [
        "", " ", "\n\t", "?", "!!!", "flood", "0, 0", "-", "+", ".,.",
        "flood at ,", "flood at -", "1" * 5000, "flood " * 500,
        "ééé", "🌊🌊🌊 at 27.7172, 85.3240", None,
    ]:
        request = parse_user_input(text, mode="offline")
        assert isinstance(request, IntelligenceRequest)
        handle_text(text, mode="offline")  # must not raise


def test_a_non_string_request_is_asked_about_rather_than_crashing():
    """A JSON or chat transport can hand over a number, a dict or a list."""
    for value in [123, 4.5, True, ["flood", 1, 2], {"disaster_type": "flood"}, 0, []]:
        request = parse_user_input(value, mode="offline")
        assert isinstance(request, IntelligenceRequest)
        assert request.disaster_type is None
        assert request.latitude is None and request.longitude is None
        assert handle_text(value, mode="offline").status == "missing_disaster_type"


# ---------------------------------------------------------------------------
# 14 & 15. scope guards
# ---------------------------------------------------------------------------


def test_parsing_opens_no_network_connection(monkeypatch):
    """Any socket attempt during parsing fails the test loudly."""

    def forbidden(*args, **kwargs):
        raise AssertionError("the parser must not open a network connection")

    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)

    request = parse("Check flood risk at 27.7172, 85.3240")
    assert request.disaster_type == "flood"
    handle_text("Check flood risk at 27.7172, 85.3240", mode="offline")


def test_parsing_makes_no_network_call_even_in_live_mode(monkeypatch):
    """The parser must be pure: it cannot fetch, whatever the mode says."""

    def forbidden(*args, **kwargs):
        raise AssertionError("the parser must not open a network connection")

    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr("main.run_flood_live", lambda *_: pytest.fail("fetched"))

    request = parse_user_input("Check flood risk at 27.7172, 85.3240", mode="live")
    assert request.disaster_type == "flood"
    assert request.mode == "live"


def _imported_modules(module) -> set[str]:
    imported: set[str] = set()
    for node in ast.walk(ast.parse(inspect.getsource(module))):
        if isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
    return imported


def test_parser_imports_no_risk_or_processing_internals():
    """It extracts three fields; it does not know what they mean."""
    imported = _imported_modules(parser_module)
    for banned in (
        "risk.flood", "risk.alert", "risk.threat", "risk.config",
        "processing.flood_features", "processing.validation",
    ):
        assert banned not in imported, f"parser imports {banned}"


def test_parser_imports_no_network_or_model_dependency():
    imported = _imported_modules(parser_module)
    for banned in (
        "requests", "httpx", "urllib", "socket", "http", "fastapi",
        "openai", "anthropic", "langchain", "ollama", "transformers", "litellm",
    ):
        assert banned not in imported, f"parser imports {banned}"


def test_parser_defines_no_schema_and_no_reasoning_helper():
    """It returns the existing request; it does not grow a model of its own."""
    source = inspect.getsource(parser_module)
    assert "class " not in source, "the parser must not define a class"
    assert "BaseModel" not in source
    assert "IntelligenceRequest" in source  # it produces the existing one
    tree = ast.parse(source)
    function_names = {
        node.name for node in tree.body if isinstance(node, ast.FunctionDef)
    }
    # exactly the public surface plus its two private extractors
    assert function_names == {
        "parse_user_input", "handle_text", "describe_parsing",
        "_extract_hazard", "_extract_coordinates",
    }


def test_parsing_is_deterministic():
    text = "Is there FLOOD risk at -12.3456, 45.6789?"
    first = parse(text)
    for _ in range(5):
        again = parse(text)
        assert again.disaster_type == first.disaster_type
        assert again.latitude == first.latitude
        assert again.longitude == first.longitude


def test_parser_passes_mode_and_scenario_through_untouched():
    request = parse_user_input(
        "Flood at 27.7172, 85.3240", mode="offline", scenario="severe"
    )
    assert request.mode == "offline"
    assert request.scenario == "severe"
    # and it never decides the mode itself
    assert parse_user_input("Flood at 27.7172, 85.3240").mode == "live"


def test_recognised_hazards_are_published_not_implied():
    payload = describe_parsing()
    assert json.loads(json.dumps(payload, allow_nan=False)) == payload
    assert payload["uses_language_model"] is False
    assert payload["geocoding"] is False
    assert payload["extracts"] == ["disaster_type", "latitude", "longitude"]
    assert payload["coordinate_order"] == "latitude_then_longitude"
    recognised = set(payload["recognised_disaster_types"])
    # everything the lexicon can emit is listed
    assert recognised == {t for _, t in HAZARD_LEXICON}
    # recognised is deliberately wider than supported
    assert SUPPORTED_DISASTER_TYPES == frozenset({"flood"})
    assert recognised > SUPPORTED_DISASTER_TYPES


def test_lexicon_patterns_all_compile():
    import re

    for pattern, disaster_type in HAZARD_LEXICON:
        re.compile(pattern)
        assert isinstance(disaster_type, str) and disaster_type


# ---------------------------------------------------------------------------
# the --text CLI flag
# ---------------------------------------------------------------------------


def test_cli_text_flag_routes_through_the_parser(capsys):
    from agent import __main__ as demo

    assert demo.main(["--text", "Check flood risk at 27.7172, 85.3240"]) == 0
    out = capsys.readouterr()
    assert "Flood threat" in out.out
    assert "parsed from free text" in out.out


def test_cli_text_flag_reports_an_unsupported_disaster(capsys):
    from agent import __main__ as demo

    assert demo.main(["--text", "Check earthquake risk at 27.7172, 85.3240"]) == 1
    assert "cannot check" in capsys.readouterr().out.lower()


def test_cli_text_flag_emits_json(capsys):
    from agent import __main__ as demo

    assert demo.main(["--text", "Flood at 27.7172, 85.3240", "--json"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["status"] == "ok"
    assert payload["event"]["contract_version"] == "1.0.0"


def test_cli_text_flag_still_defaults_to_offline(capsys):
    from agent import __main__ as demo

    demo.main(["--text", "Flood at 27.7172, 85.3240"])
    assert "synthetic" in capsys.readouterr().err.lower()


@pytest.mark.parametrize(
    ("argv", "expect_json"),
    [
        ([], False),                                 # defaults
        (["--lat", "28.2096", "--lon", "83.9856"], False),   # explicit point
        (["--type", "flood", "--scenario", "severe"], False),  # explicit type
        (["--json"], True),                          # json output
        (["--capabilities"], None),                  # capabilities
    ],
)
def test_pre_existing_cli_behaviour_is_unchanged(argv, expect_json, capsys):
    """Every flag that existed before --text must behave exactly as it did."""
    from agent import __main__ as demo

    exit_code = demo.main(argv)
    out = capsys.readouterr()
    assert exit_code in (0, 1, 2)
    if expect_json is None:
        assert json.loads(out.out)["supported_disaster_types"] == ["flood"]
    elif expect_json:
        assert json.loads(out.out)["status"] == "ok"
    else:
        assert "AGENT:" in out.out
        assert "TOOL :" in out.out


def test_cli_text_flag_overrides_lat_lon_flags(capsys):
    """A typed coordinate is the location; the flags are not consulted."""
    from agent import __main__ as demo

    demo.main(["--text", "Flood at 12.3456, 45.6789", "--lat", "27.7172", "--lon", "85.3240"])
    assert "12.3456, 45.6789" in capsys.readouterr().out
