#!/usr/bin/env bash
# Set up a local virtualenv and run the service with reload.
#
#   ./dev.sh              # run on :8000
#   PORT=8111 ./dev.sh    # run somewhere else
#
# Needs Postgres. The easiest source is the bundled compose service:
#
#   docker compose up -d db
#
# Safe to re-run: it reuses an existing .venv and reinstalls only if
# requirements.txt changed.

set -euo pipefail
cd "$(dirname "$0")"

VENV=.venv
PY="$VENV/bin/python"
PORT="${PORT:-8000}"

# `uv` and `pip` both work; which one is available depends on how the venv was
# made. `uv venv` does not seed pip, so probing is the only reliable way to
# pick. Prefer uv when it is present — it is markedly faster.
if command -v uv >/dev/null 2>&1; then
  INSTALL=(uv pip install --python "$PY" --quiet)
elif "$PY" -m pip --version >/dev/null 2>&1; then
  INSTALL=("$PY" -m pip install --quiet)
else
  echo "!! $VENV has no pip and uv is not on PATH." >&2
  echo "   Recreate it:  rm -rf $VENV && python3 -m venv $VENV" >&2
  exit 1
fi

if [ ! -x "$PY" ]; then
  echo "==> creating $VENV"
  python3 -m venv "$VENV"
fi

# Only reinstall when the manifest is newer than the last install, so a warm
# start is instant.
if [ ! -f "$VENV/.requirements.stamp" ] || [ requirements.txt -nt "$VENV/.requirements.stamp" ]; then
  echo "==> installing dependencies"
  "${INSTALL[@]}" -r requirements.txt
  touch "$VENV/.requirements.stamp"
fi

if [ ! -f .env ]; then
  echo "==> .env is missing; copying .env.example"
  echo "    Add your Gemini key from https://aistudio.google.com/apikey"
  cp .env.example .env
fi

if [ -z "${GEMINI_API_KEY:-}" ] && ! grep -qE '^GEMINI_API_KEY=.+' .env; then
  echo "!! GEMINI_API_KEY is not set in .env — the service will start but every"
  echo "   chat turn will be answered by the degraded path."
fi

echo "==> http://127.0.0.1:$PORT  (readiness: /api/ready)"
exec "$PY" -m uvicorn app.main:app --reload --host 127.0.0.1 --port "$PORT"
