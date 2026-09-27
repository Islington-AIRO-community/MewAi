"""Structured output contract for the FLARE Disaster Intelligence Layer.

This is the machine-readable interface between the Disaster Intelligence Layer
and the Post-Disaster Relief Network. It is intentionally transport-agnostic: the
same object is produced by the CLI (:mod:`main`), the HTTP API (:mod:`api`) and
the test-suite, so any consumer can rely on its shape.

A note on ``confidence``
------------------------
The contract deliberately has **no numeric confidence field**. At this milestone
there is no trained model, no calibrated probability and no validated outcome
data, so any confidence number would be invented. Instead the contract carries a
:attr:`ThreatAssessment.data_quality` block that reports *observable facts* about
the inputs - which indicators were used, what fraction of the intended weight
that represents, whether the source data was live or synthetic, and any
processing warnings. ``data_quality`` is a fact about the data, not a prediction
about the future, and it cannot be mistaken for a probability.

If a genuinely calibrated model is added in a later milestone, a
``confidence`` field can be added as an optional, explicitly-populated field at
that time.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

#: Contract version. Bump this if any field changes meaning or disappears, so
#: the relief-network team can detect an incompatible payload.
CONTRACT_VERSION = "1.0.0"

#: How the numbers in this assessment were obtained.
#:
#: ``live_api``      - fetched from a public API during this run
#: ``synthetic_demo``- read from a clearly labelled offline fixture
#: ``partial``       - at least one source failed or was unusable
#: ``none``          - no usable data at all
DataOrigin = Literal["live_api", "synthetic_demo", "partial", "none"]

#: Canonical disaster type identifiers.
FLOOD = "flood"
EARTHQUAKE = "earthquake"


def utc_now() -> datetime:
    """Current time as an aware UTC ``datetime``."""
    return datetime.now(timezone.utc)


def new_event_id(disaster_type: str, generated_at: datetime | None = None) -> str:
    """Build a readable, collision-resistant event id.

    Format: ``<disaster_type>-<YYYYMMDDHHMMSSZ>-<6 hex chars>``, e.g.
    ``flood-20260926T141205Z-3f9a2c``. The timestamp makes the id sortable and
    the random suffix keeps it unique when several locations are assessed in the
    same second.
    """
    moment = generated_at or utc_now()
    stamp = moment.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{disaster_type}-{stamp}-{uuid.uuid4().hex[:6]}"


class Location(BaseModel):
    """Where the assessment applies."""

    name: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    #: Optional administrative context, e.g. "Bagmati Province".
    country: str = "Nepal"
    #: Set when the analysed point is a model grid cell rather than the exact
    #: requested coordinate. Open-Meteo snaps requests to its grid.
    grid_point: bool = False


class DataSourceStatus(BaseModel):
    """Outcome of one external data source, whether or not it succeeded."""

    name: str
    #: ``"ok"``, or one of the ``FailureReason`` categories on failure.
    status: str
    #: ``"live_api"`` or ``"synthetic_demo"``.
    origin: DataOrigin
    detail: str | None = None
    #: Number of records the collector actually returned.
    records: int | None = None


class ThreatAssessment(BaseModel):
    """The threat level and the alert decision, kept as distinct fields.

    ``threat_level`` is the output of the classifier. ``alert`` is the output of
    the separate alert-decision stage and may be ``False`` even when
    ``threat_level`` is ``HIGH`` or ``CRITICAL`` (see
    :attr:`alert.requires_manual_verification` and :attr:`alert.suppressed`).
    """

    threat_level: str
    alert: bool
    #: Operator-facing sentence explaining the alert decision.
    reason: str
    #: True when a qualifying threat level was withheld pending human review.
    requires_manual_verification: bool = False
    #: True when the alert was withheld despite a qualifying threat level.
    suppressed: bool = False
    #: e.g. "dispatch_relief_network", "monitor", "verify_before_alerting".
    recommendation: str = "none"
    #: Which inputs were missing, if any.
    missing_indicators: list[str] = Field(default_factory=list)


class DataQuality(BaseModel):
    """Observable facts about the inputs. Not a confidence score."""

    #: Fraction of the intended indicator weight that was actually available.
    coverage: float = Field(ge=0, le=1)
    indicators_used: list[str] = Field(default_factory=list)
    indicators_missing: list[str] = Field(default_factory=list)
    #: "live_api", "synthetic_demo", "partial" or "none".
    origin: DataOrigin
    #: Per-source collection status.
    sources: list[DataSourceStatus] = Field(default_factory=list)
    #: Non-fatal problems found while validating and processing the data.
    warnings: list[str] = Field(default_factory=list)
    #: True when the data was not fetched from a live API.
    is_synthetic: bool = False


class IntelligenceEvent(BaseModel):
    """A single structured disaster-intelligence output.

    This is the object handed to the Post-Disaster Relief Network.
    """

    contract_version: str = CONTRACT_VERSION
    event_id: str
    disaster_type: str
    location: Location
    #: Risk score in ``[0, 1]``, or ``None`` when no indicator was available.
    risk_score: float | None = Field(default=None, ge=0, le=1)
    assessment: ThreatAssessment
    data_quality: DataQuality
    #: Plain-language summary suitable for display to an operator or resident.
    message: str
    #: Method, thresholds, per-indicator breakdown and raw measurements.
    evidence: dict[str, Any] = Field(default_factory=dict)
    #: When this assessment was produced (UTC).
    timestamp: datetime = Field(default_factory=utc_now)
    #: When the underlying data refers to. May be earlier than ``timestamp``.
    observation_timestamp: datetime | None = None

    @field_validator("timestamp", "observation_timestamp")
    @classmethod
    def _require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("timestamps must be timezone-aware")
        return value

    @field_validator("message")
    @classmethod
    def _message_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("message must not be blank")
        return value

    def to_dict(self) -> dict[str, Any]:
        """JSON-ready dict, with datetimes as ISO-8601 strings."""
        return self.model_dump(mode="json")
