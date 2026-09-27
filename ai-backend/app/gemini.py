"""
Thin async client for the Gemini `generateContent` REST API.

Deliberately uses `httpx` against the documented HTTP endpoint rather than the
`google-genai` SDK: it is one dependency we already need, and it makes the
fallback chain across models explicit and observable.

Two behaviours matter for a disaster-relief path:

1. **Model fallback.** The newest flash model returns HTTP 503 under peak
   demand. A 503 must never surface to a victim asking for a rescue, so every
   call walks the configured model list before giving up.
2. **Structured output.** The response schema is passed as
   `responseSchema` + `responseMimeType: application/json`, so the model is
   constrained at decode time and we parse JSON without any repair step.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx

from .config import Settings

log = logging.getLogger(__name__)


class GeminiError(RuntimeError):
    """All configured models failed. Carries a message safe to show a user."""


class Gemini:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "Gemini":
        self._client = httpx.AsyncClient(
            timeout=httpx.Timeout(self._settings.gemini_timeout_seconds),
            headers={"Content-Type": "application/json"},
        )
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def generate_json(
        self,
        *,
        system_instruction: str,
        user_text: str,
        response_schema: dict[str, Any],
        temperature: float = 0.2,
    ) -> tuple[dict[str, Any], str]:
        """
        Returns `(parsed_json, model_used)`.

        Raises `GeminiError` if the key is missing or every model fails.
        """
        if not self._settings.has_gemini_key:
            raise GeminiError(
                "GEMINI_API_KEY is not configured on the backend. Copy "
                "ai-backend/.env.example to ai-backend/.env and add your key."
            )
        if self._client is None:
            raise GeminiError("Gemini client used outside of its context manager.")

        body: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system_instruction}]},
            "contents": [{"role": "user", "parts": [{"text": user_text}]}],
            "generationConfig": {
                "temperature": temperature,
                "topP": 0.95,
                "maxOutputTokens": self._settings.gemini_max_output_tokens,
                # The slot-filling task does not benefit from long reasoning
                # traces, and they cost latency exactly when it hurts most.
                "thinkingConfig": {"thinkingBudget": 0},
                "responseMimeType": "application/json",
                "responseSchema": response_schema,
            },
        }

        assert self._client is not None  # guarded above
        client = self._client
        last_error: str = "unknown error"

        for model in self._settings.gemini_models:
            url = f"{self._settings.gemini_base_url}/models/{model}:generateContent"
            try:
                response = await client.post(
                    url,
                    headers={"x-goog-api-key": self._settings.gemini_api_key},
                    json=body,
                )
            except httpx.HTTPError as exc:  # network / timeout
                last_error = f"{type(exc).__name__}: {exc}"
                log.warning("gemini %s transport error: %s", model, last_error)
                continue

            if response.status_code != 200:
                # Never log the key, and never echo a raw upstream body to the
                # caller — the message is for a log, not a victim.
                last_error = f"HTTP {response.status_code}"
                detail = _safe_error_detail(response)
                log.warning("gemini %s -> %s %s", model, last_error, detail)
                if response.status_code in (400, 401, 403, 404):
                    # A bad key or an unknown model will not fix itself on
                    # the next entry in the list.
                    raise GeminiError(
                        f"Gemini rejected the request ({last_error}). Check "
                        "GEMINI_API_KEY and the model names in GEMINI_MODELS."
                    )
                continue

            parsed = _extract_text_json(response.json())
            if parsed is None:
                last_error = "response contained no JSON payload"
                log.warning("gemini %s -> %s", model, last_error)
                continue

            log.info("gemini %s ok", model)
            return parsed, model

        raise GeminiError(
            f"Gemini is unavailable right now ({last_error}). Please try again in a moment."
        )


def _safe_error_detail(response: httpx.Response) -> str:
    """Pull the upstream message without risking key material in the log."""
    try:
        payload = response.json()
    except ValueError:
        return ""
    message = str(payload.get("error", {}).get("message", ""))[:300]
    return message


def _extract_text_json(payload: dict[str, Any]) -> dict[str, Any] | None:
    """
    Pull the first JSON object out of a `generateContent` response.

    The `responseMimeType` guarantee normally makes this trivial, but a
    candidate can still come back empty (or finish on MAX_TOKENS), so every
    candidate is scanned before giving up.
    """
    for candidate in payload.get("candidates") or []:
        parts = (candidate.get("content") or {}).get("parts") or []
        for part in parts:
            text = part.get("text")
            if not text:
                continue
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                continue
            if isinstance(parsed, dict):
                return parsed
    return None


async def warm_up(settings: Settings) -> None:  # pragma: no cover - diagnostics
    """Cheap connectivity probe used by the CLI, not by request handling."""
    if not settings.has_gemini_key:
        raise GeminiError("no key")
    async with Gemini(settings) as gemini:
        await asyncio.gather(gemini.generate_json(
            system_instruction="Return JSON.",
            user_text='Return exactly {"ok": true}.',
            response_schema={
                "type": "object",
                "properties": {"ok": {"type": "boolean"}},
                "required": ["ok"],
            },
        ))
