"""
Runtime configuration.

The Gemini key and the Postgres DSN are both server-side secrets and are read
here only. Nothing in `app/` ever logs them, and the key is never returned to
the browser — the Next.js app talks to this service through its own
`/api/ai/*` proxy routes.

Values come from the environment, falling back to `ai-backend/.env` (which is
gitignored). `ai-backend/.env.example` documents every key.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---- Gemini -------------------------------------------------------
    gemini_api_key: str = Field(default="", description="Google AI Studio key.")
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    # Tried in order. 3.8 is the newest but sheds load under peak demand, and
    # 3.5 is the reliable fallback; 2.5 is the floor for older API surfaces.
    # `NoDecode` stops pydantic-settings from JSON-parsing the raw env value
    # before `_split_csv` sees it, so a plain comma-separated string works.
    gemini_models: Annotated[tuple[str, ...], NoDecode] = (
        "gemini-3.8-flash",
        "gemini-3.5-flash",
        "gemini-2.5-flash",
    )
    gemini_timeout_seconds: float = 30.0
    gemini_max_output_tokens: int = 1536

    # ---- Gemini Live (voice) ------------------------------------------
    # The Live API is a different surface from `generateContent` above: a
    # WebSocket, a different API version, and an ephemeral-token handshake.
    # `gemini_live_api_version` is pinned to v1alpha on purpose — verified
    # against the live service, v1beta opens a socket but *rejects*
    # `proactivity`, so v1alpha is the only version that can turn proactive
    # audio on. See `live_tokens.py` for the rest of what was pinned.
    gemini_live_api_version: str = "v1alpha"
    gemini_live_model: str = "gemini-3.8-live"
    # `Charon` is the "Informative" prebuilt voice. Note that Gemini does NOT
    # validate this: an unknown name is accepted at setup and silently falls
    # back to a default voice, so a typo here is invisible. It is pinned in
    # the ephemeral token and logged on mint for that reason.
    gemini_live_voice: str = "Charon"
    gemini_live_language: str = "en-US"
    # The token authorises a browser to open a socket against our quota. It is
    # minted per session and single-use, so keep it short.
    gemini_live_token_ttl_seconds: int = 900
    gemini_live_token_timeout_seconds: float = 15.0
    # How long a turn of silence must be before the server considers the
    # reporter finished speaking. Longer than the default because a stressed
    # person pauses mid-sentence, and a cut-off sentence loses a fact.
    gemini_live_silence_duration_ms: int = 900
    gemini_live_start_of_speech_sensitivity: str = "START_SENSITIVITY_HIGH"

    # ---- Postgres -----------------------------------------------------
    database_url: str = Field(
        default="",
        description="asyncpg DSN, e.g. postgresql://flare:flare@localhost:5432/flare",
    )
    db_pool_min_size: int = 1
    db_pool_max_size: int = 5

    # ---- HTTP ---------------------------------------------------------
    cors_origins: Annotated[tuple[str, ...], NoDecode] = (
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    )

    @field_validator("gemini_models", "cors_origins", mode="before")
    @classmethod
    def _split_csv(cls, v: object) -> object:
        """Accept both a JSON list and a plain comma-separated env value."""
        if isinstance(v, str):
            stripped = v.strip()
            if not stripped:
                return ()
            if stripped.startswith("["):
                return v
            return tuple(part.strip() for part in stripped.split(",") if part.strip())
        return v

    @property
    def has_gemini_key(self) -> bool:
        return bool(self.gemini_api_key.strip())

    @property
    def has_database(self) -> bool:
        return bool(self.database_url.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
