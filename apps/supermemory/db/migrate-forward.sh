#!/bin/sh
set -eu

if [ -z "${SUPERMEMORY_DATABASE_URL:-}" ]; then
  echo "SUPERMEMORY_DATABASE_URL is required for memory database migrations." >&2
  exit 1
fi

psql "$SUPERMEMORY_DATABASE_URL" -v ON_ERROR_STOP=1 -f /supermemory-db/001_schema.sql
