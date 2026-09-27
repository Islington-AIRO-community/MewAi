"""Tests for the Milestone 2 agent-facing tool contract.

No network access. Every test that reaches the pipeline uses
``mode="offline"``, which feeds the labelled synthetic fixtures through the real
``run_flood_pipeline``. The one test that exercises the ``live`` branch replaces
the entry point with a recorder, so the branch is covered without a socket.

What is pinned here
-------------------
* the tool's closed status vocabulary, so a new state cannot appear unnoticed;
* that a successful call returns a genuine ``IntelligenceEvent`` with every
  Milestone 1 field intact -- this is the test that would fail if the tool grew
  its own competing result shape;
* that the agent asks instead of guessing, and refuses to route an unsupported
  disaster to flood;
* that no LLM, network or ``DEMO_LOCATIONS`` dependency sneaks in.
"""

from __future__ import annotations

import ast
import inspect
import json
from pathlib import Path
from typing import get_args

import pytest

from agent import agent as agent_module
from agent import tool as tool_module
from agent.agent import handle_request
from agent.tool import (
    SUPPORTED_DISASTER_TYPES,
    IntelligenceRequest,
    IntelligenceResponse,
    build_location,
    coordinate_label,
    describe_capabilities,
    run_intelligence_tool,
)
from demo.fixtures import DEFAULT_SCENARIO, available_scenarios
from schemas.events import CONTRACT_VERSION, IntelligenceEvent, Location

#: A real point. Not one of the five ``DEMO_LOCATIONS``.
KATHMANDU_LAT = 27.7172
KATHMANDU_LON = 85.3240


def offline_request(**overrides) -> IntelligenceRequest:
    """A well-formed offline flood request, with optional overrides."""
    params = {
        "disaster_type": "flood",
        "latitude": KATHMANDU_LAT,
        "longitude": KATHMANDU_LON,
        "mode": "offline",
    }
    params.update(overrides)
    return IntelligenceRequest(**params)


# ---------------------------------------------------------------------------
# 1. a valid flood request with coordinates
# ---------------------------------------------------------------------------


def test_valid_flood_request_with_coordinates_returns_an_assessment():
    response = run_intelligence_tool(offline_request())
    assert response.status == "ok"
    assert response.ok is True
    assert response.event is not None
    assert response.event.disaster_type == "flood"
    assert response.event.assessment.threat_level in {"LOW", "MODERATE", "HIGH", "CRITICAL"}


def test_coordinates_are_the_primary_location_representation():
    """The tool must not require a name or resolve the point to a demo place."""
    response = run_intelligence_tool(offline_request(latitude=12.3456, longitude=-45.6789))
    assert response.status == "ok"
    assert response.event.location.latitude == pytest.approx(12.3456)
    assert response.event.location.longitude == pytest.approx(-45.6789)


def test_arbitrary_coordinates_are_not_restricted_to_the_demo_locations():
    """Any valid coordinate works, including one far outside Nepal."""
    for latitude, longitude in [(27.7172, 85.3240), (0.0, 0.0), (-33.8688, 151.2093)]:
        response = run_intelligence_tool(
            offline_request(latitude=latitude, longitude=longitude)
        )
        assert response.status == "ok", (latitude, longitude)
        assert response.event.location.latitude == pytest.approx(latitude)


def test_coordinate_label_is_the_coordinate_not_a_geocoded_name():
    """``Location.name`` is required by the contract, but we do not invent a place."""
    assert coordinate_label(27.7172, 85.3240) == "27.7172, 85.3240"
    label = build_location(27.7172, 85.3240).name
    assert label == "27.7172, 85.3240"
    # nothing here claims to know a place
    assert "Kathmandu" not in label


# ---------------------------------------------------------------------------
# 2. missing disaster type
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("disaster_type", [None, "", "   "])
def test_missing_disaster_type_asks_for_it(disaster_type):
    response = run_intelligence_tool(offline_request(disaster_type=disaster_type))
    assert response.status == "missing_disaster_type"
    assert response.ok is False
    assert response.event is None
    assert "disaster type" in response.next_question.lower()
    # the detail says which of the two reasons applied
    assert response.detail == "no disaster type was supplied"


def test_disaster_type_is_matched_case_insensitively():
    response = run_intelligence_tool(offline_request(disaster_type="  FlOoD  "))
    assert response.status == "ok"


# ---------------------------------------------------------------------------
# 3. missing location
# ---------------------------------------------------------------------------


def test_missing_location_asks_for_it():
    response = run_intelligence_tool(offline_request(latitude=None, longitude=None))
    assert response.status == "missing_location"
    assert response.event is None
    assert "latitude" in response.next_question.lower()
    assert "longitude" in response.next_question.lower()
    assert response.detail == "neither latitude nor longitude was supplied"


@pytest.mark.parametrize(
    ("kwargs", "expected"),
    [
        ({"latitude": None}, "latitude was supplied without the other coordinate"),
        ({"longitude": None}, "longitude was supplied without the other coordinate"),
    ],
)
def test_half_a_location_is_treated_as_missing(kwargs, expected):
    """A single coordinate cannot be sent to a collector, so it is not a location."""
    response = run_intelligence_tool(offline_request(**kwargs))
    assert response.status == "missing_location"
    assert response.detail == expected


# ---------------------------------------------------------------------------
# 4. invalid coordinates
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [
        (91.0, 85.3240),      # latitude above +90
        (-91.0, 85.3240),     # latitude below -90
        (27.7172, 181.0),     # longitude above +180
        (27.7172, -181.0),    # longitude below -180
        (float("nan"), 85.3240),
        (float("inf"), 85.3240),
        (27.7172, float("nan")),
    ],
)
def test_invalid_coordinates_are_refused_not_forwarded(latitude, longitude):
    response = run_intelligence_tool(
        offline_request(latitude=latitude, longitude=longitude)
    )
    assert response.status == "invalid_location"
    assert response.event is None
    assert "-90" in response.next_question and "180" in response.next_question
    assert response.detail  # pydantic's own message is surfaced for the log


def test_coordinate_bounds_come_from_the_existing_schema():
    """The tool must not carry its own idea of a valid coordinate."""
    for latitude, longitude in [(90.0, 180.0), (-90.0, -180.0)]:
        assert build_location(latitude, longitude).latitude == latitude
    with pytest.raises(Exception):
        build_location(90.0001, 0.0)


# ---------------------------------------------------------------------------
# 5. unsupported disaster types
# ---------------------------------------------------------------------------


def test_flood_is_the_only_supported_type():
    assert SUPPORTED_DISASTER_TYPES == frozenset({"flood"})


@pytest.mark.parametrize(
    "disaster_type", ["earthquake", "landslide", "wildfire", "cyclone", "floods"]
)
def test_unsupported_disaster_type_is_refused_not_routed_to_flood(disaster_type):
    response = run_intelligence_tool(offline_request(disaster_type=disaster_type))
    assert response.status == "unsupported_disaster"
    assert response.event is None
    assert "flood" in response.next_question  # tells the user what is possible


def test_earthquake_is_unsupported_because_the_result_is_not_contract_compatible():
    """The honest reason: serving it would need a second, competing schema."""
    response = run_intelligence_tool(offline_request(disaster_type="earthquake"))
    assert response.status == "unsupported_disaster"
    assert "IntelligenceEvent" in response.detail

    # and the repository really does have an earthquake path that does not
    # produce the contract object
    from risk.earthquake import assess_earthquake

    result = assess_earthquake([], 27.7172, 85.3240)
    assert isinstance(result, dict)
    assert "contract_version" not in result


# ---------------------------------------------------------------------------
# 6. a successful structured intelligence response
# ---------------------------------------------------------------------------


def test_successful_response_is_a_real_intelligence_event():
    response = run_intelligence_tool(offline_request())
    event = response.event
    assert isinstance(event, IntelligenceEvent)
    # the object the pipeline built, not a re-description of it
    assert event.event_id.startswith("flood-")
    assert event.contract_version == CONTRACT_VERSION
    assert event.to_dict()["disaster_type"] == "flood"


def test_successful_response_preserves_every_milestone_one_field():
    """The regression guard against the tool growing its own result shape."""
    event = run_intelligence_tool(offline_request()).event
    payload = event.to_dict()

    # location
    assert payload["location"]["latitude"] == pytest.approx(KATHMANDU_LAT)
    assert payload["location"]["longitude"] == pytest.approx(KATHMANDU_LON)
    assert "grid_point" in payload["location"]
    # risk score
    assert payload["risk_score"] is None or 0.0 <= payload["risk_score"] <= 1.0
    # threat level
    assert payload["assessment"]["threat_level"] in {
        "LOW", "MODERATE", "HIGH", "CRITICAL", "UNKNOWN"
    }
    # alert decision
    assert isinstance(payload["assessment"]["alert"], bool)
    assert payload["assessment"]["reason"]
    assert "requires_manual_verification" in payload["assessment"]
    assert "suppressed" in payload["assessment"]
    # data quality / coverage
    assert 0.0 <= payload["data_quality"]["coverage"] <= 1.0
    assert payload["data_quality"]["origin"] == "synthetic_demo"
    assert payload["data_quality"]["is_synthetic"] is True
    assert payload["data_quality"]["sources"]
    # provenance
    assert payload["data_quality"]["indicators_used"]
    # warnings and evidence
    assert isinstance(payload["data_quality"]["warnings"], list)
    assert payload["evidence"]["indicators"]
    assert payload["evidence"]["measurements"]
    # timestamps
    assert payload["timestamp"]
    # the prototype disclaimer survives to the answer
    assert "not official" in event.message


def test_offline_mode_is_labelled_synthetic_and_never_claims_to_be_live():
    event = run_intelligence_tool(offline_request()).event
    assert event.data_quality.origin == "synthetic_demo"
    assert event.data_quality.is_synthetic is True
    assert any("not from a live API" in w for w in event.data_quality.warnings)


def test_invalid_scenario_is_refused():
    response = run_intelligence_tool(offline_request(scenario="no-such-scenario"))
    assert response.status == "invalid_scenario"
    assert response.event is None
    assert "no-such-scenario" in response.detail


def test_default_scenario_is_a_real_scenario():
    assert DEFAULT_SCENARIO in available_scenarios()


# ---------------------------------------------------------------------------
# live mode dispatches to the live entry point (recorded, not called)
# ---------------------------------------------------------------------------


def test_live_mode_calls_the_live_entry_point(monkeypatch):
    """Covers the live branch without opening a socket."""
    calls = []

    def fake_live(location):
        calls.append(location)
        return run_intelligence_tool(offline_request()).event

    monkeypatch.setattr(tool_module, "run_flood_live", fake_live)
    response = run_intelligence_tool(
        IntelligenceRequest(
            disaster_type="flood", latitude=KATHMANDU_LAT, longitude=KATHMANDU_LON
        )
    )
    assert response.status == "ok"
    assert calls and calls[0].latitude == pytest.approx(KATHMANDU_LAT)


# ---------------------------------------------------------------------------
# 7. the agent
# ---------------------------------------------------------------------------


def test_agent_asks_for_the_disaster_type_when_it_is_missing():
    reply = handle_request(
        IntelligenceRequest(latitude=KATHMANDU_LAT, longitude=KATHMANDU_LON, mode="offline")
    )
    assert reply.status == "missing_disaster_type"
    assert reply.needs_input is True
    assert reply.event is None
    assert "disaster type" in reply.message.lower()


def test_agent_asks_for_the_location_when_it_is_missing():
    reply = handle_request(IntelligenceRequest(disaster_type="flood", mode="offline"))
    assert reply.status == "missing_location"
    assert reply.needs_input is True
    assert "location" in reply.message.lower()


def test_agent_answers_with_a_readable_summary_and_the_event():
    reply = handle_request(offline_request())
    assert reply.status == "ok"
    assert reply.needs_input is False
    assert isinstance(reply.event, IntelligenceEvent)
    # readable: names the place, the level, the score and the alert decision
    assert "27.7172, 85.3240" in reply.message
    assert "Risk score" in reply.message
    assert "alert" in reply.message.lower()
    # and it states the provenance rather than implying a live observation
    assert "SYNTHETIC" in reply.message
    assert "not a live observation" in reply.message


def test_agent_never_presents_synthetic_data_as_live():
    reply = handle_request(offline_request())
    assert "SYNTHETIC demo data" in reply.message
    assert "Coverage" in reply.message


def test_agent_refuses_an_unsupported_disaster_in_plain_language():
    reply = handle_request(offline_request(disaster_type="wildfire"))
    assert reply.status == "unsupported_disaster"
    assert reply.needs_input is True
    assert "wildfire" in reply.message
    # it did not quietly produce a flood answer instead
    assert reply.event is None


@pytest.mark.parametrize(
    ("status", "question_fragment", "agent_fragment", "params"),
    [
        (
            "missing_disaster_type",
            "disaster type",
            "disaster type",
            {"disaster_type": None},
        ),
        (
            "missing_location",
            "latitude",
            "location",
            {"disaster_type": "flood", "latitude": None, "longitude": None},
        ),
        (
            "invalid_location",
            "not a real location",
            "not usable",
            {"disaster_type": "flood", "longitude": 999.0},
        ),
        (
            "unsupported_disaster",
            "Supported types",
            "cannot check",
            {"disaster_type": "wildfire"},
        ),
        (
            "invalid_scenario",
            "synthetic scenario",
            "synthetic scenario",
            {"disaster_type": "flood", "scenario": "nope"},
        ),
    ],
)
def test_every_problem_status_has_a_distinct_explanation(
    status, question_fragment, agent_fragment, params
):
    """No status may fall through to a generic, uninformative reply.

    Each one has to say what is wrong at the tool level, and the agent has to
    lead with its own plain-language explanation *and* surface the tool's
    follow-up verbatim -- so the agent never invents a follow-up of its own.
    """
    response = run_intelligence_tool(offline_request(**params))
    assert response.status == status
    assert response.event is None
    assert question_fragment in response.next_question

    reply = handle_request(offline_request(**params))
    assert reply.status == status
    assert reply.needs_input is True
    assert reply.event is None
    assert agent_fragment in reply.message
    assert reply.message.endswith(response.next_question)


def test_status_vocabulary_is_closed():
    """A new state cannot be introduced without updating this test."""
    declared = IntelligenceResponse.model_fields["status"].annotation
    assert set(get_args(declared)) == {
        "ok",
        "missing_disaster_type",
        "missing_location",
        "invalid_location",
        "unsupported_disaster",
        "invalid_scenario",
    }


# ---------------------------------------------------------------------------
# scope guards: the tool must stay thin, deterministic and offline
# ---------------------------------------------------------------------------


def _imported_modules(module) -> set[str]:
    """Every module name imported by ``module``, from its AST rather than its text.

    Reading the AST means a docstring that *mentions* ``requests`` cannot trigger
    a false positive, which a substring search over the source could not avoid.
    """
    imported: set[str] = set()
    for node in ast.walk(ast.parse(inspect.getsource(module))):
        if isinstance(node, ast.Import):
            imported.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imported.add(node.module)
    return imported


def test_the_agent_does_not_import_the_risk_implementation():
    """The agent may only read the output contract, never the internals."""
    banned = {"risk.flood", "risk.alert", "risk.threat", "processing.flood_features"}
    for module in (agent_module, tool_module):
        assert not banned & _imported_modules(module), module.__name__


def test_the_agent_has_no_llm_dependency():
    """No model client may be introduced: the agent is a comparison tree."""
    banned = {"openai", "anthropic", "langchain", "ollama", "transformers", "litellm"}
    for module in (agent_module, tool_module):
        assert not banned & _imported_modules(module), module.__name__


def test_the_tool_touches_no_network_transport():
    """The tool is a plain function; the network lives one layer down."""
    banned = {"requests", "httpx", "urllib", "socket", "http", "fastapi", "starlette"}
    for module in (agent_module, tool_module):
        assert not banned & _imported_modules(module), module.__name__


def test_the_agent_never_imports_the_demo_location_table():
    """The tool addresses coordinates, not the five demo places."""
    for module in (agent_module, tool_module):
        source = inspect.getsource(module)
        assert "DEMO_LOCATIONS" not in source


def test_the_agent_does_not_invent_a_second_event_schema():
    """The result must be the Milestone 1 contract, not a lookalike."""
    for module in (agent_module, tool_module):
        source = inspect.getsource(module)
        assert "class IntelligenceEvent" not in source
    # the only event model in play is the one from schemas.events
    assert IntelligenceResponse.model_fields["event"].annotation == (
        IntelligenceEvent | None
    )
    assert CONTRACT_VERSION == "1.0.0"


def test_capabilities_declaration_is_serialisable_and_honest():
    payload = describe_capabilities()
    # strict JSON: a NaN or Infinity anywhere would fail this
    assert json.loads(json.dumps(payload, allow_nan=False)) == payload
    assert payload["supported_disaster_types"] == ["flood"]
    assert payload["modes"] == ["live", "offline"]
    assert payload["geocoding"] is False
    assert payload["free_text_parsing"] is False
    assert payload["request_schema"]["title"] == "IntelligenceRequest"
    assert payload["response_schema"]["title"] == "IntelligenceResponse"


def test_no_new_top_level_module_was_added_beyond_the_agent_package():
    """Milestone 2 adds ``agent/`` only; the Milestone 1 tree is untouched."""
    root = Path(__file__).resolve().parent.parent
    new_package = root / "agent"
    assert new_package.is_dir()
    assert sorted(p.name for p in new_package.glob("*.py")) == [
        "__init__.py",
        "__main__.py",
        "agent.py",
        "parser.py",
        "tool.py",
    ]


# ---------------------------------------------------------------------------
# the demonstration harness (python -m agent)
# ---------------------------------------------------------------------------


def test_demo_defaults_to_offline_so_it_cannot_fail_on_a_bad_connection(capsys):
    """A demo that needs the network can only fail; synthetic is the default."""
    from agent import __main__ as demo

    assert demo.main([]) == 0
    out = capsys.readouterr()
    assert "synthetic" in out.err.lower()
    assert "SYNTHETIC" in out.out


def test_demo_reports_that_the_agent_needs_input_with_a_nonzero_exit(capsys):
    from agent import __main__ as demo

    assert demo.main(["--type", "earthquake"]) == 1
    assert "cannot check" in capsys.readouterr().out


def test_demo_emits_the_full_reply_as_json(capsys):
    from agent import __main__ as demo

    assert demo.main(["--json"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["status"] == "ok"
    assert payload["needs_input"] is False
    # the event is the existing contract, so its own fields are present
    assert payload["event"]["contract_version"] == "1.0.0"
    assert payload["event"]["data_quality"]["is_synthetic"] is True


def test_demo_prints_its_capabilities_on_request(capsys):
    from agent import __main__ as demo

    assert demo.main(["--capabilities"]) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["supported_disaster_types"] == ["flood"]
