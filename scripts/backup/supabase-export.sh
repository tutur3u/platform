#!/usr/bin/env bash
# Gated Supabase export for the Cloudflare migration safety net.
#
#   supabase-export.sh catalog   sizes, write counters, exact row counts, storage stats
#   supabase-export.sh export    catalog + pg_dump + roles + storage copy + restore check
#
# Every statement sent to Supabase is a read. Counts, storage stats and
# pg_dump share one exported snapshot, so row-count parity is exact. The
# repository is public, so logs are public too: this script prints only pass
# or fail and hashes. Counts, sizes, error output and data are age-encrypted
# and go only to the bucket-locked R2 backup bucket.
set -euo pipefail
# A dead snapshot holder must not kill the script through SIGPIPE.
trap '' PIPE

MODE="${1:-}"
case "$MODE" in catalog | export) ;; *)
  echo "usage: $0 catalog|export" >&2
  exit 2
  ;;
esac

require() {
  local name
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      echo "::error::Missing required environment variable $name" >&2
      exit 1
    fi
  done
}

require TARGET PROJECT_REF DB_PASSWORD POOLER_HOST DB_CA_CERT WORK_DIR AGE_RECIPIENTS \
  R2_ENDPOINT R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY GIT_SHA RUN_ID RUN_ATTEMPT
if [ "$MODE" = export ]; then
  require STORAGE_S3_ENDPOINT STORAGE_S3_REGION STORAGE_S3_ACCESS_KEY_ID STORAGE_S3_SECRET_ACCESS_KEY
fi

case "$TARGET:$PROJECT_REF" in
  staging:fxefojytwimjiqxseqag | production:nzamlzqfdwaaxdefwraj) ;;
  *)
    echo "::error::Target and project ref do not match a known Supabase project." >&2
    exit 1
    ;;
esac
if ! [[ "$POOLER_HOST" =~ ^aws-[0-9]+-ap-southeast-1\.pooler\.supabase\.com$ ]]; then
  echo "::error::POOLER_HOST is not a Supabase ap-southeast-1 session pooler host." >&2
  exit 1
fi
case "$WORK_DIR" in /*) ;; *)
  echo "::error::WORK_DIR must be an absolute path." >&2
  exit 1
  ;;
esac

# At least two recipients (owner and escrow holder), so one lost key cannot
# strand a backup. Plugin recipients such as age1yubikey are not accepted.
RECIPIENT_ARGS=()
for recipient in $(tr ' ' '\n' <<<"$AGE_RECIPIENTS" | sort -u); do
  if ! [[ "$recipient" =~ ^age1[0-9a-z]{58}$ ]]; then
    echo "::error::AGE_RECIPIENTS contains a value that is not an age X25519 public key." >&2
    exit 1
  fi
  RECIPIENT_ARGS+=(-r "$recipient")
done
if [ "${#RECIPIENT_ARGS[@]}" -lt 4 ]; then
  echo "::error::AGE_RECIPIENTS needs at least two distinct public keys." >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
PREFIX="supabase/$TARGET/$STAMP-$RUN_ID-$RUN_ATTEMPT"
OUT="$WORK_DIR/out"
PLAIN="$WORK_DIR/plain"
mkdir -p "$OUT" "$PLAIN"
chmod 700 "$WORK_DIR" "$PLAIN"

# Minimum free space for the catalog files. Export mode checks again after
# the snapshot reads, sized from the data (see disk-needed below).
avail_bytes() { echo $(($(df --output=avail -k "$WORK_DIR" | tail -1 | tr -d ' ') * 1024)); }
if [ "$(avail_bytes)" -lt $((1024 ** 3)) ]; then
  echo "::error::Not enough free disk at WORK_DIR." >&2
  exit 1
fi

printf '%s\n' "$DB_CA_CERT" >"$PLAIN/supabase-ca.crt"
export PGPASSWORD="$DB_PASSWORD"
export PGSSLMODE=verify-full
export PGSSLROOTCERT="$PLAIN/supabase-ca.crt"
DB_URL="postgresql://postgres.$PROJECT_REF@$POOLER_HOST:5432/postgres"
PGBIN=/usr/lib/postgresql/17/bin
PSQL="$PGBIN/psql"

# Supabase-managed schemas that the platform rebuilds, that hold secrets
# (vault) or that hold transient queues (net, realtime). Their DDL comes from
# migrations; cron jobs, Vault secrets and supabase_functions hooks are not in
# the backup.
EXCLUDED_SCHEMAS=(graphql graphql_public net pgbouncer pgsodium pgsodium_masks realtime _realtime supabase_functions vault cron _analytics)
EXCLUDED_SQL="$(printf "'%s'," "${EXCLUDED_SCHEMAS[@]}")"
EXCLUDED_SQL="${EXCLUDED_SQL%,}"

# Tables owned by an extension are not dumped by pg_dump, so they are left
# out of parity.
COUNTS_SQL="select n.nspname as schema, c.relname as \"table\",
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from only %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint as rows
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' and n.nspname not in ($EXCLUDED_SQL)
    and n.nspname not like 'pg\\_%' and n.nspname <> 'information_schema'
    and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
  order by 1, 2"
# Cumulative insert/update/delete counters since the last stats reset size
# the D1 mirror's write volume (rows written, including index entries).
SIZES_SQL="select n.nspname as schema, c.relname as \"table\", c.reltuples::bigint as estimated_rows,
  pg_total_relation_size(c.oid) as total_bytes, pg_indexes_size(c.oid) as index_bytes,
  (select count(*) from pg_index i where i.indrelid = c.oid) as indexes,
  coalesce(s.n_tup_ins, 0) as inserts, coalesce(s.n_tup_upd, 0) as updates, coalesce(s.n_tup_del, 0) as deletes,
  (select stats_reset from pg_stat_database where datname = current_database()) as stats_reset
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
  where c.relkind in ('r', 'p') and n.nspname not like 'pg\\_%' and n.nspname <> 'information_schema'
  order by total_bytes desc"
# Objects without a recorded size (unfinished uploads) and folder keys ending
# in '/' cannot be compared as files; they are counted separately.
STORAGE_SQL="select bucket_id as bucket, count(*) as objects,
  coalesce(sum((metadata->>'size')::bigint), 0) as bytes
  from storage.objects where metadata ? 'size' and name not like '%/'
  group by bucket_id order by 1"
STORAGE_EXCLUDED_SQL="select bucket_id as bucket, count(*) as objects
  from storage.objects where metadata is null or not (metadata ? 'size') or name like '%/'
  group by bucket_id order by 1"

# Key-level lists for export parity, read in the same snapshot.
BUCKETS_SQL="select id from storage.buckets order by 1"
STORAGE_KEYS_SQL="select bucket_id as bucket, name, (metadata->>'size')::bigint as size
  from storage.objects where metadata ? 'size' and name not like '%/' order by 1, 2"
STORAGE_EXCLUDED_KEYS_SQL="select bucket_id as bucket, name from storage.objects
  where metadata is null or not (metadata ? 'size') or name like '%/' order by 1, 2"

one_line() { tr '\n' ' ' <<<"$1"; }

encrypt() {
  age "${RECIPIENT_ARGS[@]}" -o "$OUT/$(basename "$1").age" "$1"
  rm -f "$1"
}

upload() {
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION=auto aws s3 cp --only-show-errors --endpoint-url "$R2_ENDPOINT" \
    "$1" "s3://$R2_BUCKET/$PREFIX/$(basename "$1")" >/dev/null 2>"$PLAIN/upload.err" || {
    echo "::error::Upload to the backup bucket failed." >&2
    exit 1
  }
}

# Encrypt and upload a diagnostic file, then fail with a generic message.
fail_with() {
  local message="$1" file="$2"
  if [ -s "$file" ]; then
    encrypt "$file"
    upload "$OUT/$(basename "$file").age"
  fi
  echo "::error::$message (details are in the encrypted bundle only)." >&2
  exit 1
}

# Hold one read-only repeatable-read transaction open and export its snapshot.
FIFO="$PLAIN/snapshot.in"
mkfifo "$FIFO"
"$PSQL" "$DB_URL" -X -q -A -t -v ON_ERROR_STOP=1 <"$FIFO" >"$PLAIN/snapshot.out" 2>"$PLAIN/snapshot.err" &
HOLDER_PID=$!
exec 3>"$FIFO"
RESTORE_DIR=""
cleanup() {
  { echo 'rollback;' >&3; } 2>/dev/null || true
  exec 3>&- 2>/dev/null || true
  wait "$HOLDER_PID" 2>/dev/null || true
  if [ -n "$RESTORE_DIR" ] && [ -d "$RESTORE_DIR" ]; then
    "$PGBIN/pg_ctl" -D "$RESTORE_DIR" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$PLAIN"
}
trap cleanup EXIT
holder() { { printf '%s\n' "$1" >&3; } 2>/dev/null || true; }
holder 'set idle_in_transaction_session_timeout = 0;'
holder 'set statement_timeout = 0;'
holder 'begin isolation level repeatable read, read only;'
holder 'select pg_export_snapshot();'
SNAPSHOT=""
for _ in $(seq 1 60); do
  SNAPSHOT="$(grep -m1 -E '^[0-9A-F]+-[0-9A-F]+-[0-9]+$' "$PLAIN/snapshot.out" || true)"
  [ -n "$SNAPSHOT" ] && break
  kill -0 "$HOLDER_PID" 2>/dev/null || break
  sleep 1
done
[ -n "$SNAPSHOT" ] || fail_with "Could not export a database snapshot" "$PLAIN/snapshot.err"
SNAPSHOT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# row_security = off makes a count fail, as pg_dump does, rather than
# return a number silently filtered by RLS.
in_snapshot() {
  "$PSQL" "$DB_URL" -X -q -v ON_ERROR_STOP=1 \
    -c 'set statement_timeout = 0;' \
    -c 'set row_security = off;' \
    -c 'begin isolation level repeatable read, read only;' \
    -c "set transaction snapshot '$SNAPSHOT';" \
    -c "\\copy ($(one_line "$1")) to '$2' with (format csv, header)" \
    -c 'commit;' >/dev/null 2>"$PLAIN/query.err" ||
    fail_with "A snapshot query failed" "$PLAIN/query.err"
}
in_snapshot "$COUNTS_SQL" "$PLAIN/counts.csv"
in_snapshot "$SIZES_SQL" "$PLAIN/sizes.csv"
in_snapshot "$STORAGE_SQL" "$PLAIN/storage-stats.csv"
in_snapshot "$STORAGE_EXCLUDED_SQL" "$PLAIN/storage-excluded.csv"
echo "Snapshot read."

FILES=()
PARITY='null'
STORAGE_REPORT='null'
RESTORE_REPORT='null'
parity_ok=0
storage_ok=0

if [ "$MODE" = export ]; then
  in_snapshot "$BUCKETS_SQL" "$PLAIN/buckets.csv"
  in_snapshot "$STORAGE_KEYS_SQL" "$PLAIN/storage-keys.csv"
  in_snapshot "$STORAGE_EXCLUDED_KEYS_SQL" "$PLAIN/storage-excluded-keys.csv"
  need_bytes="$(node "$HERE/backup-manifest.mjs" disk-needed "$PLAIN/sizes.csv" "$PLAIN/storage-keys.csv" 2>/dev/null)" ||
    fail_with "Could not size the export" /dev/null
  if [ "$(avail_bytes)" -lt "$need_bytes" ]; then
    fail_with "Not enough free disk at WORK_DIR for this export" /dev/null
  fi

  exclude_args=()
  for schema in "${EXCLUDED_SCHEMAS[@]}"; do exclude_args+=(--exclude-schema="$schema"); done
  "$PGBIN/pg_dump" "$DB_URL" --snapshot="$SNAPSHOT" -Fc -Z 6 "${exclude_args[@]}" \
    -f "$PLAIN/database.dump" 2>"$PLAIN/pg_dump.err" ||
    fail_with "pg_dump failed" "$PLAIN/pg_dump.err"
  holder 'commit;'
  # --no-role-passwords reads pg_roles instead of pg_authid, which the
  # non-superuser postgres role on Supabase can read.
  "$PGBIN/pg_dumpall" -d "$DB_URL" --roles-only --no-role-passwords \
    -f "$PLAIN/roles.sql" 2>"$PLAIN/roles.err" ||
    fail_with "The role dump failed" "$PLAIN/roles.err"

  # Storage: copy every bucket listed in the snapshot, then compare at key
  # level: every sized key must arrive with its size, and anything else must
  # be a key the snapshot excluded. A sync error (for example an excluded row
  # with no backend object) is recorded, and the key comparison decides.
  mkdir -p "$PLAIN/storage"
  # Buckets with a key that cannot map inside the bucket directory, or with
  # an id that is not a safe directory name, are not synced; they fail parity.
  node "$HERE/backup-manifest.mjs" unsafe-buckets "$PLAIN/storage-keys.csv" \
    "$PLAIN/storage-excluded-keys.csv" "$PLAIN/unsafe-buckets.txt" ||
    printf '*\n' >"$PLAIN/unsafe-buckets.txt"
  while IFS= read -r bucket; do
    if ! [[ "$bucket" =~ ^[a-z0-9][a-z0-9._-]*$ ]] || grep -qxF -e "$bucket" -e '*' "$PLAIN/unsafe-buckets.txt"; then
      echo "skipped one bucket (unsafe id or keys)" >>"$PLAIN/storage-sync.err"
      storage_skipped=1
      continue
    fi
    mkdir -p "$PLAIN/storage/$bucket"
    AWS_ACCESS_KEY_ID="$STORAGE_S3_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$STORAGE_S3_SECRET_ACCESS_KEY" \
      AWS_DEFAULT_REGION="$STORAGE_S3_REGION" aws s3 sync --only-show-errors \
      --endpoint-url "$STORAGE_S3_ENDPOINT" "s3://$bucket" "$PLAIN/storage/$bucket" \
      >/dev/null 2>>"$PLAIN/storage-sync.err" || echo "sync exit $? for one bucket" >>"$PLAIN/storage-sync.err"
  done < <(tail -n +2 "$PLAIN/buckets.csv")
  node "$HERE/backup-manifest.mjs" compare-storage "$PLAIN/storage-keys.csv" \
    "$PLAIN/storage-excluded-keys.csv" "$PLAIN/storage" "$PLAIN/buckets.csv" \
    "$PLAIN/storage-report.json" || storage_ok=$?
  [ "${storage_skipped:-0}" = 0 ] || storage_ok=1
  # Stream the archive straight into age so no plaintext tar is written.
  { tar -C "$PLAIN" -cf - storage | age "${RECIPIENT_ARGS[@]}" -o "$OUT/storage.tar.age"; } \
    2>"$PLAIN/archive.err" || fail_with "Archiving storage failed" "$PLAIN/archive.err"
  rm -rf "$PLAIN/storage"
  FILES+=("$OUT/storage.tar.age")

  # Restore check in a local Postgres 17 cluster with pgvector, reachable
  # only through a Unix socket. Supabase-only extensions are missing there;
  # parity is judged on table row counts.
  RESTORE_DIR="$PLAIN/restore-cluster"
  SOCKET_DIR="$PLAIN/socket"
  mkdir -p "$SOCKET_DIR"
  # A dedicated bootstrap superuser, so the replayed roles.sql (which alters
  # the role named postgres) never touches the restore's own admin.
  "$PGBIN/initdb" -D "$RESTORE_DIR" -U restore_admin --auth=trust -E UTF8 >/dev/null 2>"$PLAIN/restore.log" ||
    fail_with "initdb failed" "$PLAIN/restore.log"
  "$PGBIN/pg_ctl" -D "$RESTORE_DIR" -w -l "$PLAIN/restore-server.log" \
    -o "-c listen_addresses='' -c unix_socket_directories='$SOCKET_DIR' -c port=55432" start \
    >/dev/null 2>>"$PLAIN/restore.log" ||
    fail_with "The restore cluster did not start" "$PLAIN/restore-server.log"
  RESTORE_URL="postgresql://restore_admin@/postgres?host=$SOCKET_DIR&port=55432&sslmode=disable"
  for role in anon authenticated service_role authenticator supabase_admin supabase_auth_admin \
    supabase_storage_admin dashboard_user supabase_realtime_admin supabase_replication_admin \
    supabase_read_only_user supabase_functions_admin pgbouncer postgres; do
    "$PSQL" "$RESTORE_URL" -X -q -c "create role $role nologin;" >/dev/null 2>>"$PLAIN/restore.log" || true
  done
  "$PSQL" "$RESTORE_URL" -X -q -f "$PLAIN/roles.sql" >/dev/null 2>>"$PLAIN/restore.log" || true
  "$PGBIN/pg_restore" -d "$RESTORE_URL" --no-owner --no-acl -j 4 \
    "$PLAIN/database.dump" >/dev/null 2>>"$PLAIN/restore.log" || true
  errors="$(grep -oE 'errors ignored on restore: [0-9]+' "$PLAIN/restore.log" | tail -n1 | grep -oE '[0-9]+$' || true)"
  [[ "$errors" =~ ^[0-9]+$ ]] || errors=0
  "$PSQL" "$RESTORE_URL" -X -q -v ON_ERROR_STOP=1 \
    -c "\\copy ($(one_line "$COUNTS_SQL")) to '$PLAIN/restored-counts.csv' with (format csv, header)" \
    >/dev/null 2>>"$PLAIN/restore.log" || fail_with "Counting the restored tables failed" "$PLAIN/restore.log"
  "$PGBIN/pg_ctl" -D "$RESTORE_DIR" -m fast stop >/dev/null 2>&1 || true
  rm -rf "$RESTORE_DIR"
  RESTORE_DIR=""
  node "$HERE/backup-manifest.mjs" compare-counts "$PLAIN/counts.csv" \
    "$PLAIN/restored-counts.csv" "$PLAIN/parity-report.json" || parity_ok=$?

  # A missing or truncated report reads as a failed result; nothing from it
  # reaches the log.
  summary() {
    node -e 'try{const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(JSON.stringify({ok:r.ok===true,tables:r.tables,rows:r.rows,objects:r.objects}))}catch{console.log("{\"ok\":false}")}' \
      "$1" 2>/dev/null || echo '{"ok":false}'
  }
  PARITY="$(summary "$PLAIN/parity-report.json")"
  STORAGE_REPORT="$(summary "$PLAIN/storage-report.json")"
  RESTORE_REPORT="{\"errorsIgnored\":$errors}"
  for file in database.dump roles.sql buckets.csv storage-keys.csv storage-excluded-keys.csv \
    storage-report.json storage-sync.err restored-counts.csv parity-report.json \
    restore.log restore-server.log; do
    [ -f "$PLAIN/$file" ] || continue
    encrypt "$PLAIN/$file"
    FILES+=("$OUT/$file.age")
  done
else
  holder 'commit;'
fi

for file in counts.csv sizes.csv storage-stats.csv storage-excluded.csv; do
  encrypt "$PLAIN/$file"
  FILES+=("$OUT/$file.age")
done

cat >"$PLAIN/manifest-options.json" <<JSON
{"target":"$TARGET","projectRef":"$PROJECT_REF","gitSha":"$GIT_SHA","runId":"$RUN_ID-$RUN_ATTEMPT","snapshotTakenAt":"$SNAPSHOT_AT","mode":"$MODE","parity":$PARITY,"storage":$STORAGE_REPORT,"restore":$RESTORE_REPORT}
JSON
node "$HERE/backup-manifest.mjs" manifest "$PLAIN/manifest-options.json" "$OUT/manifest.json" "${FILES[@]}"
# The manifest goes last, so a partial upload is identifiable.
for file in "${FILES[@]}" "$OUT/manifest.json"; do upload "$file"; done

MANIFEST_SHA="$(sha256sum "$OUT/manifest.json" | cut -d' ' -f1)"
{
  echo "### Supabase $MODE ($TARGET)"
  echo "- R2 prefix: \`$PREFIX\`"
  echo "- manifest sha256: \`$MANIFEST_SHA\`"
  if [ "$MODE" = export ]; then
    echo "- row-count parity: $([ "$parity_ok" = 0 ] && echo ok || echo FAILED)"
    echo "- storage parity: $([ "$storage_ok" = 0 ] && echo ok || echo FAILED)"
  fi
} >>"${GITHUB_STEP_SUMMARY:-/dev/stdout}"

if [ "$MODE" = export ] && { [ "$parity_ok" != 0 ] || [ "$storage_ok" != 0 ]; }; then
  echo "::error::Export uploaded, but parity failed. Do not use it as a verified backup." >&2
  exit 1
fi
