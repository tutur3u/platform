#!/bin/sh
set -eu

HIVE_DATABASE_URL="${HIVE_DATABASE_URL:?HIVE_DATABASE_URL is required}"
HIVE_DB_BASELINE_FILE="${HIVE_DB_BASELINE_FILE:-/hive-db/001_schema.sql}"
HIVE_DB_BASELINE_VERSION="${HIVE_DB_BASELINE_VERSION:-20260518104000}"
HIVE_DB_MIGRATIONS_DIR="${HIVE_DB_MIGRATIONS_DIR:-/hive-db/migrations}"
HIVE_DB_OPERATOR_ROLE="${HIVE_DB_OPERATOR_ROLE:-runtime}"
HIVE_DB_ALLOW_DESTRUCTIVE_RESET="${HIVE_DB_ALLOW_DESTRUCTIVE_RESET:-0}"
HIVE_DB_DEVOPS_ADMIN_APPROVED="${HIVE_DB_DEVOPS_ADMIN_APPROVED:-0}"

log() {
  printf '%s\n' "$*" >&2
}

fail() {
  log "Hive DB migration failed: $*"
  exit 1
}

psql_hive() {
  psql "$HIVE_DATABASE_URL" -v ON_ERROR_STOP=1 "$@"
}

psql_scalar() {
  psql_hive -At "$@"
}

checksum_file() {
  sha256sum "$1" | awk '{ print $1 }'
}

sql_literal() {
  quoted_value="$(printf '%s' "$1" | sed "s/'/''/g")"
  printf "'%s'" "$quoted_value"
}

version_lte() {
  left="$1"
  right="$2"

  if [ "$left" = "$right" ]; then
    return 0
  fi

  first="$(printf '%s\n%s\n' "$left" "$right" | sort | sed -n '1p')"
  [ "$first" = "$left" ]
}

version_to_timestamptz() {
  version="$1"
  case "$version" in
    [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9])
      ;;
    *)
      fail "migration version $version must use YYYYMMDDHHMMSS"
      ;;
  esac

  printf '%s-%s-%s %s:%s:%s+00\n' \
    "$(printf '%s' "$version" | cut -c 1-4)" \
    "$(printf '%s' "$version" | cut -c 5-6)" \
    "$(printf '%s' "$version" | cut -c 7-8)" \
    "$(printf '%s' "$version" | cut -c 9-10)" \
    "$(printf '%s' "$version" | cut -c 11-12)" \
    "$(printf '%s' "$version" | cut -c 13-14)"
}

ensure_migration_table() {
  psql_hive <<'SQL'
create table if not exists hive_schema_migrations (
  version text primary key
    check (version ~ '^[0-9]{14}$'),
  filename text not null,
  checksum text not null
    check (checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz not null default now(),
  applied_by text not null default current_user
);

create index if not exists hive_schema_migrations_applied_at_idx
  on hive_schema_migrations(applied_at desc);
SQL
}

assert_forward_only_sql() {
  sql_file="$1"

  if [ "$HIVE_DB_ALLOW_DESTRUCTIVE_RESET" = "1" ] &&
    [ "$HIVE_DB_OPERATOR_ROLE" = "devops-admin" ] &&
    [ "$HIVE_DB_DEVOPS_ADMIN_APPROVED" = "1" ]; then
    log "DevOps admin override enabled for destructive Hive DB migration guard."
    return
  fi

  if grep -Eiq '(^|[[:space:];])(drop[[:space:]]+(database|schema|table)|truncate[[:space:]]|alter[[:space:]]+table[^;]*drop[[:space:]]+column|delete[[:space:]]+from[[:space:]]+hive_schema_migrations|update[[:space:]]+hive_schema_migrations)' "$sql_file"; then
    fail "$sql_file contains reset/destructive SQL. Set HIVE_DB_OPERATOR_ROLE=devops-admin, HIVE_DB_ALLOW_DESTRUCTIVE_RESET=1, and HIVE_DB_DEVOPS_ADMIN_APPROVED=1 only for an approved DevOps-admin operation."
  fi
}

get_applied_checksum() {
  quoted_version="$(sql_literal "$1")"
  psql_scalar -c "select coalesce((select checksum from hive_schema_migrations where version = $quoted_version), '')"
}

assert_not_before_recorded_floor() {
  version="$1"
  initial_floor_version="$2"
  initial_floor_applied_at="$3"

  if [ -n "$initial_floor_version" ] && version_lte "$version" "$initial_floor_version"; then
    fail "pending migration $version is not newer than recorded migration version $initial_floor_version"
  fi

  if [ -n "$initial_floor_applied_at" ]; then
    version_timestamp="$(version_to_timestamptz "$version")"
    quoted_version_timestamp="$(sql_literal "$version_timestamp")"
    quoted_floor_applied_at="$(sql_literal "$initial_floor_applied_at")"
    is_before_floor="$(
      psql_scalar -c "select case when $quoted_version_timestamp::timestamptz <= $quoted_floor_applied_at::timestamptz then '1' else '0' end"
    )"

    if [ "$is_before_floor" = "1" ]; then
      fail "pending migration $version timestamp ($version_timestamp) is not newer than last recorded migration time $initial_floor_applied_at"
    fi
  fi
}

apply_migration() {
  version="$1"
  filename="$2"
  checksum="$3"
  sql_file="$4"

  assert_forward_only_sql "$sql_file"
  tmp_sql="$(mktemp)"

  {
    printf 'begin;\n'
    printf 'lock table hive_schema_migrations in exclusive mode;\n'
    printf '\\i %s\n' "$sql_file"
    printf "insert into hive_schema_migrations (version, filename, checksum, applied_by) values (:'migration_version', :'migration_filename', :'migration_checksum', current_user);\n"
    printf 'commit;\n'
  } >"$tmp_sql"

  psql_hive \
    -v migration_version="$version" \
    -v migration_filename="$filename" \
    -v migration_checksum="$checksum" \
    -f "$tmp_sql"

  rm -f "$tmp_sql"
  log "Applied Hive DB migration $version ($filename)."
}

validate_applied_migration() {
  version="$1"
  filename="$2"
  checksum="$3"
  applied_checksum="$(get_applied_checksum "$version")"

  if [ -z "$applied_checksum" ]; then
    return 1
  fi

  if [ "$applied_checksum" != "$checksum" ]; then
    fail "applied Hive DB migration $version checksum does not match $filename"
  fi

  return 0
}

prepare_legacy_baseline_tables() {
  has_hive_servers="$(psql_scalar -c "select case when to_regclass('hive_servers') is null then '0' else '1' end")"

  if [ "$has_hive_servers" != "1" ]; then
    return
  fi

  psql_hive <<'SQL'
create table if not exists hive_research_sessions (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references hive_servers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text,
  status text not null default 'running'
    check (status in ('running', 'paused', 'completed', 'archived')),
  created_by uuid,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists hive_research_sessions_one_running_idx
  on hive_research_sessions(server_id)
  where status = 'running';

create index if not exists hive_research_sessions_server_created_idx
  on hive_research_sessions(server_id, created_at desc);

do $$
begin
  if to_regclass('hive_world_events') is not null then
    alter table hive_world_events
      add column if not exists research_session_id uuid references hive_research_sessions(id) on delete set null;
  end if;

  if to_regclass('hive_npc_runs') is not null then
    alter table hive_npc_runs
      add column if not exists research_session_id uuid references hive_research_sessions(id) on delete set null;
  end if;

  if to_regclass('hive_simulation_ticks') is not null then
    alter table hive_simulation_ticks
      add column if not exists research_session_id uuid references hive_research_sessions(id) on delete set null;
  end if;
end $$;
SQL
}

if [ ! -f "$HIVE_DB_BASELINE_FILE" ]; then
  fail "baseline schema file not found at $HIVE_DB_BASELINE_FILE"
fi

ensure_migration_table

initial_floor_version="$(psql_scalar -c "select coalesce(max(version), '') from hive_schema_migrations")"
initial_floor_applied_at="$(psql_scalar -c "select coalesce(max(applied_at)::text, '') from hive_schema_migrations")"
baseline_filename="$(basename "$HIVE_DB_BASELINE_FILE")"
baseline_checksum="$(checksum_file "$HIVE_DB_BASELINE_FILE")"

if ! validate_applied_migration "$HIVE_DB_BASELINE_VERSION" "$baseline_filename" "$baseline_checksum"; then
  existing_count="$(psql_scalar -c "select count(*) from hive_schema_migrations")"

  if [ "$existing_count" != "0" ]; then
    fail "Hive DB has migration history but is missing baseline $HIVE_DB_BASELINE_VERSION"
  fi

  log "Applying Hive DB baseline $HIVE_DB_BASELINE_VERSION from $baseline_filename."
  prepare_legacy_baseline_tables
  apply_migration "$HIVE_DB_BASELINE_VERSION" "$baseline_filename" "$baseline_checksum" "$HIVE_DB_BASELINE_FILE"
fi

current_version="$(psql_scalar -c "select coalesce(max(version), '') from hive_schema_migrations")"

if [ -d "$HIVE_DB_MIGRATIONS_DIR" ]; then
  for migration_file in "$HIVE_DB_MIGRATIONS_DIR"/*.sql; do
    [ -e "$migration_file" ] || break

    filename="$(basename "$migration_file")"
    version="$(printf '%s' "$filename" | sed -n 's/^\([0-9]\{14\}\)_.*/\1/p')"

    if [ -z "$version" ]; then
      fail "migration file $filename must be named YYYYMMDDHHMMSS_description.sql"
    fi

    checksum="$(checksum_file "$migration_file")"

    if validate_applied_migration "$version" "$filename" "$checksum"; then
      continue
    fi

    assert_not_before_recorded_floor "$version" "$initial_floor_version" "$initial_floor_applied_at"

    if [ -n "$current_version" ] && version_lte "$version" "$current_version"; then
      fail "pending migration $version must be newer than migration $current_version applied earlier in this run"
    fi

    apply_migration "$version" "$filename" "$checksum" "$migration_file"
    current_version="$version"
  done
fi

log "Hive DB migrations are forward-only and up to date at $current_version."
