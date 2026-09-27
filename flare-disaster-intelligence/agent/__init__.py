"""FLARE Milestone 2 - the agent-facing tool contract.

    agent.parser   - deterministic free text -> IntelligenceRequest
    agent.tool     - the request/response contract an agent calls
    agent.agent    - a deterministic agent that drives that contract

Nothing in this package re-implements the Disaster Intelligence pipeline; it
delegates to the same entry points the CLI and the HTTP API already use.
"""

from agent.agent import AgentReply, handle_request
from agent.parser import (
    HAZARD_LEXICON,
    describe_parsing,
    handle_text,
    parse_user_input,
)
from agent.tool import (
    SUPPORTED_DISASTER_TYPES,
    IntelligenceRequest,
    IntelligenceResponse,
    ToolStatus,
    build_location,
    coordinate_label,
    describe_capabilities,
    run_intelligence_tool,
)

__all__ = [
    "HAZARD_LEXICON",
    "SUPPORTED_DISASTER_TYPES",
    "AgentReply",
    "IntelligenceRequest",
    "IntelligenceResponse",
    "ToolStatus",
    "build_location",
    "coordinate_label",
    "describe_capabilities",
    "describe_parsing",
    "handle_request",
    "handle_text",
    "parse_user_input",
    "run_intelligence_tool",
]
