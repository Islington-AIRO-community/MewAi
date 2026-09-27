"""Shared HTTP access layer for external data collectors.

Every outbound request in FLARE goes through :func:`fetch_json` so that failure
modes are classified the same way for every source. Callers get either a parsed
JSON payload or a :class:`DataSourceError` that explains what went wrong.

This module contains no FLARE domain logic; it only knows about HTTP.
"""

from __future__ import annotations

import time
from typing import Any, Callable

import requests

#: Default per-attempt timeout in seconds. Kept modest so the CLI demo and the
#: HTTP API both fail fast instead of hanging during a presentation.
DEFAULT_TIMEOUT = 20.0

#: Number of attempts made before giving up (1 retry).
DEFAULT_ATTEMPTS = 2

#: Seconds to wait between attempts.
RETRY_BACKOFF_SECONDS = 1.0


class DataSourceError(Exception):
    """Raised when an external data source cannot be used.

    Attributes
    ----------
    source:
        Human-readable name of the source, e.g. ``"open-meteo-flood"``.
    reason:
        Machine-readable failure category, see :class:`FailureReason`.
    detail:
        Optional extra context (HTTP status, upstream message, ...).
    """

    def __init__(self, source: str, reason: str, detail: str | None = None) -> None:
        self.source = source
        self.reason = reason
        self.detail = detail
        message = f"{source}: {reason}"
        if detail:
            message = f"{message} ({detail})"
        super().__init__(message)

    def as_dict(self) -> dict[str, Any]:
        return {"source": self.source, "reason": self.reason, "detail": self.detail}


class FailureReason:
    """Machine-readable failure categories.

    These strings are part of the output contract: the Post-Disaster Relief
    Network can branch on them, so they are kept stable.
    """

    TIMEOUT = "timeout"
    NETWORK_UNREACHABLE = "network_unreachable"
    HTTP_ERROR = "http_error"
    MALFORMED_JSON = "malformed_json"
    UNEXPECTED_PAYLOAD = "unexpected_payload"
    INVALID_REQUEST = "invalid_request"


def _extract_upstream_reason(response: requests.Response) -> str | None:
    """Return the ``reason``/``error`` text an Open-Meteo style API returns.

    Verified response shape for a rejected coordinate::

        {"reason": "Latitude must be in range of -90 to 90. Given: 999.0.",
         "error": true}
    """
    try:
        body = response.json()
    except ValueError:
        return None
    if isinstance(body, dict):
        for key in ("reason", "error", "message"):
            value = body.get(key)
            if isinstance(value, str) and value:
                return value
    return None


def fetch_json(
    url: str,
    params: dict[str, Any] | None = None,
    *,
    source: str,
    timeout: float = DEFAULT_TIMEOUT,
    attempts: int = DEFAULT_ATTEMPTS,
    session: requests.Session | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    """GET ``url`` and return the decoded JSON object.

    Parameters
    ----------
    url:
        Absolute endpoint URL.
    params:
        Query parameters.
    source:
        Name used in error messages.
    timeout:
        Per-attempt timeout in seconds.
    attempts:
        Total attempts, including the first one. Transient network problems are
        retried; a well-formed HTTP 4xx is not, because retrying a bad
        coordinate cannot succeed.
    session:
        Optional injected session (used by tests).
    sleep:
        Injected sleep function (used by tests to avoid real delays).

    Raises
    ------
    DataSourceError
        For every failure mode, with a populated :class:`FailureReason`.
    """
    if attempts < 1:
        raise ValueError("attempts must be >= 1")

    getter = session.get if session is not None else requests.get
    last_error: DataSourceError | None = None

    for attempt in range(1, attempts + 1):
        is_final_attempt = attempt == attempts
        try:
            response = getter(url, params=params, timeout=timeout)
        except requests.Timeout as exc:
            last_error = DataSourceError(source, FailureReason.TIMEOUT, str(exc) or None)
        except requests.RequestException as exc:
            last_error = DataSourceError(
                source, FailureReason.NETWORK_UNREACHABLE, str(exc) or None
            )
        else:
            try:
                response.raise_for_status()
            except requests.HTTPError:
                status = response.status_code
                upstream = _extract_upstream_reason(response)
                is_client_error = 400 <= status < 500
                last_error = DataSourceError(
                    source,
                    FailureReason.INVALID_REQUEST
                    if is_client_error
                    else FailureReason.HTTP_ERROR,
                    f"HTTP {status}: {upstream}" if upstream else f"HTTP {status}",
                )
                # A 4xx means the request itself is wrong, so retrying it cannot
                # succeed. A 5xx is a server-side fault and is worth retrying.
                if is_client_error:
                    is_final_attempt = True
            else:
                try:
                    payload = response.json()
                except ValueError as exc:
                    last_error = DataSourceError(
                        source, FailureReason.MALFORMED_JSON, str(exc) or None
                    )
                else:
                    if isinstance(payload, dict):
                        return payload
                    last_error = DataSourceError(
                        source,
                        FailureReason.UNEXPECTED_PAYLOAD,
                        f"expected a JSON object, got {type(payload).__name__}",
                    )

        if is_final_attempt:
            assert last_error is not None
            raise last_error
        sleep(RETRY_BACKOFF_SECONDS)

    # Unreachable: the loop either returns or raises.
    raise last_error or DataSourceError(source, FailureReason.NETWORK_UNREACHABLE)
