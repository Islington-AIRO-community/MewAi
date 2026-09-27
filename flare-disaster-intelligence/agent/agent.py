"""A deliberately small, deterministic agent that drives the tool contract.

The whole agent is eight steps and no model::

    1. receive a user request
    2. is a disaster type present?
    3. is a usable location present?
    4. no type  -> ask for the disaster type
    5. no place -> ask for the location
    6. both present -> call the tool
    7. receive the structured result
    8. produce a concise human-readable response

There is **no LLM here**, and that is the design decision, not an omission. Every
branch is a comparison and every answer is a formatted string, so the agent's
behaviour is pinned by the test-suite rather than by a prompt. A language model
can be added *in front of* this module later -- it would parse free text into an
:class:`~agent.tool.IntelligenceRequest` and nothing else would change.

The agent never imports :mod:`risk.flood` or any other internals. Its only
contact with the intelligence layer is the returned ``IntelligenceEvent``, which
it reads to write a sentence. It does not recompute, re-rank or second-guess a
score.

What the agent will not do
--------------------------
* Guess a missing coordinate, a missing disaster type, or a missing unit.
* Route an unsupported disaster to flood "to be helpful".
* Present a synthetic or partial result as if it were a live observation. The
  data-quality line in every answer says which one it is.
"""

from __future__ import annotations

from pydantic import BaseModel

from agent.tool import IntelligenceRequest, IntelligenceResponse, run_intelligence_tool
from schemas.events import IntelligenceEvent


class AgentReply(BaseModel):
    """What the agent says back, and the assessment it is based on.

    ``event`` is the untouched output contract, passed straight through so a
    caller can render its own view without re-reading the tool's internals.
    """

    #: Mirrors the tool status, so a caller needs to look at one place.
    status: str
    #: The human-readable answer. Always populated, never empty.
    message: str
    #: The existing ``IntelligenceEvent`` when the pipeline ran.
    event: IntelligenceEvent | None = None
    #: True when the agent is waiting on the user for something.
    needs_input: bool = False


def handle_request(request: IntelligenceRequest) -> AgentReply:
    """Run one request through the agent and return its answer.

    Steps 2-8 of the outline above, in order. Deterministic and side-effect
    free apart from whatever the requested mode actually calls.
    """
    response = run_intelligence_tool(request)
    if response.ok:
        return AgentReply(
            status=response.status,
            message=_render_assessment(response.event),
            event=response.event,
        )
    return AgentReply(
        status=response.status,
        message=_render_problem(response),
        needs_input=True,
    )


def _render_assessment(event: IntelligenceEvent) -> str:
    """Turn a finished assessment into one readable paragraph.

    Reads only the output contract. The pipeline already wrote a good operator
    sentence in ``event.message``, so that is reused verbatim rather than
    paraphrased -- paraphrasing it here would create a second wording to keep in
    sync, and could quietly drop a caveat.
    """
    quality = event.data_quality
    headline = (
        f"Flood threat {event.assessment.threat_level} at "
        f"{event.location.name} "
        f"({event.location.latitude}, {event.location.longitude}). "
    )
    if event.risk_score is None:
        headline += "No risk score could be computed. "
    else:
        headline += f"Risk score {event.risk_score:.2f} out of 1. "
    headline += (
        "Alert raised. " if event.assessment.alert
        else f"No alert ({event.assessment.reason}). "
    )
    if event.assessment.requires_manual_verification:
        headline += "Manual verification is required before this is acted on. "
    return headline + _render_quality(quality.origin, quality.coverage, quality.is_synthetic)


def _render_quality(origin: str, coverage: float, is_synthetic: bool) -> str:
    """One line stating how much to trust the numbers above it.

    Provenance is stated in the answer itself, not just in the event payload,
    because the whole point of the Milestone 1 contract is that a reader can
    never mistake a synthetic or degraded result for a live observation.
    """
    if is_synthetic:
        source = "SYNTHETIC demo data, not a live observation"
    elif origin == "partial":
        source = "live data, but at least one source failed"
    elif origin == "none":
        source = "no usable data was available"
    else:
        source = "live data"
    return f"Data quality: {source}. Coverage {coverage:.0%}."


def _render_problem(response: IntelligenceResponse) -> str:
    """Say what is wrong, and ask the one question that fixes it."""
    if response.status == "missing_disaster_type":
        lead = "I need a disaster type before I can check anything."
    elif response.status == "missing_location":
        lead = "I need a location before I can check anything."
    elif response.status == "invalid_location":
        lead = "That location is not usable."
    elif response.status == "unsupported_disaster":
        lead = "I cannot check that disaster type."
    elif response.status == "invalid_scenario":
        lead = "I cannot run that synthetic scenario."
    else:  # pragma: no cover - the status vocabulary is closed
        lead = "The request could not be completed."
    question = response.next_question or "Could you rephrase the request?"
    return f"{lead} {question}"
