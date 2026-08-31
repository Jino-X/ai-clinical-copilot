#!/usr/bin/env bash
# Runs the RLS policy tests against a real PostgreSQL instance.
#
# RLS is the tenant isolation boundary for this product, so the policies are
# tested behaviourally rather than merely applied and assumed correct.
#
# Usage:
#   scripts/test-db.sh                 # start a throwaway local cluster
#   TEST_DATABASE_URL=postgres://...   # or test an existing empty database
#
# The target database is dropped and recreated. Never point this at anything
# you care about, and never at production.

set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$PWD"

# pgvector is not required by the tests; only the Phase 1 migration declares it,
# and a plain postgres image does not have it. Skipped rather than faked.
SKIP_VECTOR="${SKIP_VECTOR:-1}"

run_sql() {
  psql "$1" -v ON_ERROR_STOP=1 -q -f "$2"
}

apply_all() {
  local url="$1"
  local tmp
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  run_sql "$url" "$REPO_ROOT/supabase/tests/00_supabase_shim.sql"

  for migration in "$REPO_ROOT"/supabase/migrations/*.sql; do
    local target="$migration"
    if [ "$SKIP_VECTOR" = "1" ]; then
      target="$tmp/$(basename "$migration")"
      grep -v 'create extension if not exists vector' "$migration" > "$target"
    fi
    echo "  applying $(basename "$migration")"
    run_sql "$url" "$target"
  done

  for test_file in "$REPO_ROOT"/supabase/tests/01_*.sql; do
    echo "  running $(basename "$test_file")"
    run_sql "$url" "$test_file"
  done

  # Migrations must be re-runnable: a partially applied deploy gets retried.
  echo "  re-applying migrations to verify idempotency"
  for migration in "$REPO_ROOT"/supabase/migrations/*.sql; do
    local target="$migration"
    if [ "$SKIP_VECTOR" = "1" ]; then
      target="$tmp/$(basename "$migration")"
    fi
    run_sql "$url" "$target" > /dev/null
  done
}

if [ -n "${TEST_DATABASE_URL:-}" ]; then
  echo "Testing against TEST_DATABASE_URL"
  apply_all "$TEST_DATABASE_URL"
else
  PG_PREFIX="${PG_PREFIX:-/opt/homebrew/opt/postgresql@18}"
  if [ ! -x "$PG_PREFIX/bin/initdb" ]; then
    echo "error: no PostgreSQL found at $PG_PREFIX." >&2
    echo "Set PG_PREFIX, or set TEST_DATABASE_URL to an existing database." >&2
    exit 1
  fi

  DATA_DIR="$(mktemp -d)"
  PORT="${PGPORT:-55432}"
  export PGHOST="$DATA_DIR/sock"
  mkdir -p "$PGHOST"

  cleanup() {
    "$PG_PREFIX/bin/pg_ctl" -D "$DATA_DIR/data" stop -m immediate >/dev/null 2>&1 || true
    rm -rf "$DATA_DIR"
  }
  trap cleanup EXIT

  echo "Starting a throwaway cluster in $DATA_DIR"
  "$PG_PREFIX/bin/initdb" -D "$DATA_DIR/data" -U postgres --auth=trust -E UTF8 >/dev/null
  "$PG_PREFIX/bin/pg_ctl" -D "$DATA_DIR/data" \
    -o "-p $PORT -k $PGHOST -c listen_addresses=''" \
    -l "$DATA_DIR/postgres.log" start >/dev/null

  URL="postgresql://postgres@/cctest?host=$PGHOST&port=$PORT"
  "$PG_PREFIX/bin/psql" "postgresql://postgres@/postgres?host=$PGHOST&port=$PORT" \
    -q -c "create database cctest;"

  export PATH="$PG_PREFIX/bin:$PATH"
  apply_all "$URL"
fi

echo
echo "Database tests passed."
