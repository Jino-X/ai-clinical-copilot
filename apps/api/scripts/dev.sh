#!/usr/bin/env bash
# Local API dev server. Creates the virtualenv on first run.
set -euo pipefail

cd "$(dirname "$0")/.."

PYTHON_BIN="${PYTHON_BIN:-python3.13}"

if [ ! -d .venv ]; then
  echo "Creating virtualenv with ${PYTHON_BIN}..."
  "${PYTHON_BIN}" -m venv .venv
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet -r requirements-dev.txt
fi

if [ ! -f .env ]; then
  echo "warning: apps/api/.env not found — copy .env.example and fill it in." >&2
fi

exec .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
