#!/usr/bin/env bash
# Meet AI self_v1 (#7309) verification on a DISPOSABLE Supabase PG17 database.
# Usage: PSQL='docker exec -i -e PGOPTIONS=-cverify.disposable=meet-self-v1 <container> psql -U postgres -h localhost' \
#          apps/database/verification/meet-self-v1.sh
# PSQL_ADMIN (same container, -U supabase_admin) installs auth.jwt() when the
# bare image lacks it (GoTrue normally does); everything else runs as postgres.
# PSQL must reach a fresh database of a task-owned container started from
# public.ecr.aws/supabase/postgres:17.x. The bootstrap refuses any database
# that already has public.workspaces or lacks verify.disposable=meet-self-v1.
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL=${PSQL:-psql}
run() { # run <file> [single-transaction]
  local file=$1
  if [[ ${2:-} == tx ]] && ! grep -qiE '^begin;' "$file"; then
    $PSQL -X -q -v ON_ERROR_STOP=1 -1 -f - <"$file"
  else
    $PSQL -X -q -v ON_ERROR_STOP=1 -f - <"$file"
  fi
}
lineage=(
  20260907040000_meet_ai_sessions
  20260909153000_meet_transcription_recovery
  20261029100110_align_meeting_identity_and_transcript_access
  20261029170000_meet_transcript_retention_purge
  20261030044719_meet_ai_consent_schema
  20261101090100_exclude_easy_center_from_meet_transcript_purge
)
self_v1=(
  20261111120201_meet_ai_self_v1_contracts
  20261111120202_meet_ai_chunks_legacy_sequence_key
  20261111120203_meet_ai_chunks_stream_sequence_key
  20261111120204_meet_ai_chunks_account_session_idx
  20261111120205_meet_ai_chunks_timeline_idx
  20261111120206_meet_ai_chunks_stream_identity_guard
  20261111120207_validate_meet_ai_self_v1_constraints
  20261111120208_meet_ai_self_v1_read_contracts
  20261124114100_meet_ai_self_v1_capture_path
  20261124114200_meet_ai_self_v1_cost_rpcs
)
# main's meet-ai-consent-schema/-retention suites need main's full parent RLS
# (workspace_meetings policies, creator membership triggers); run them on a
# full replay, not on this minimal parent.
suites=(
  meet-ai-self-v1-schema
  meet-ai-self-v1-read-contract
  meet-ai-self-v1-consent
  meet-ai-self-v1-capture-path
)
forward() {
  local m
  for m in "${self_v1[@]}"; do
    case $m in
      2026111112020[2-5]_*) run "supabase/migrations/$m.sql" ;; # CONCURRENTLY: no transaction
      *) run "supabase/migrations/$m.sql" tx ;;
    esac
  done
}
status=0
suites_pass() {
  local suite out pass fail
  for suite in "${suites[@]}"; do
    out=$($PSQL -X -At -v ON_ERROR_STOP=1 -f - <"supabase/tests/$suite.sql" 2>&1) || true
    pass=$(grep -cE '^ok ' <<<"$out" || true)
    fail=$(grep -cE '^not ok ' <<<"$out" || true)
    printf 'SUITE %s pass=%s fail=%s plan=%s\n' "$suite" "$pass" "$fail" \
      "$(grep -E '^1\.\.[0-9]+' <<<"$out" | tail -1)"
    if [[ $fail != 0 || $pass == 0 ]] || ! grep -qE '^1\.\.[0-9]+' <<<"$out" \
       || grep -qE 'ERROR|Looks like' <<<"$out"; then
      grep -E '^not ok|^#|ERROR' <<<"$out" | head -40
      status=1
    fi
  done
}

if [[ -n ${PSQL_ADMIN:-} ]]; then
  $PSQL_ADMIN -X -q -v ON_ERROR_STOP=1 -c "do \$\$ begin
    if to_regprocedure('auth.jwt()') is null then
      create function auth.jwt() returns jsonb language sql stable as \$f\$
        select coalesce(nullif(current_setting('request.jwt.claim', true), ''),
          nullif(current_setting('request.jwt.claims', true), ''))::jsonb \$f\$;
      grant execute on function auth.jwt() to anon, authenticated, service_role;
    end if; end \$\$"
fi
run verification/meet-self-v1-bootstrap.sql
for m in "${lineage[@]}"; do run "supabase/migrations/$m.sql" tx; done
forward
echo '== forward'
suites_pass

# The capture path rollbacks refuse while a self_v1 session can still capture
# and while a self_v1 chunk is still reserved after the session closed.
guard_ids="u := '00000000-0000-4000-8000-000000089901'::uuid; ws := '00000000-0000-4000-8000-000000089902'::uuid;
  m := '00000000-0000-4000-8000-000000089903'::uuid; c := '00000000-0000-4000-8000-000000089904'::uuid;
  sid := (select id from public.meet_ai_sessions where meeting_id = m);"
guard_sql() { $PSQL -X -q -v ON_ERROR_STOP=1 -c "do \$\$ declare u uuid; ws uuid; m uuid; c uuid; sid uuid;
  begin $guard_ids $1 end \$\$"; }
rollback_refused() { # rollback_refused <label>
  local m out
  for m in 20261124114200_meet_ai_self_v1_cost_rpcs 20261124114100_meet_ai_self_v1_capture_path; do
    if out=$(run "rollbacks/$m.rollback.sql" 2>&1); then
      echo "== rollback guard MISSING for $m ($1)"; status=1
    elif grep -q 'before rolling back' <<<"$out"; then
      echo "== rollback $m refused ($1): $(grep -o '[A-Z][a-z]* every .*before rolling back' <<<"$out" | head -1)"
    else
      echo "$out"; status=1
    fi
  done
  kept=$($PSQL -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_proc
    where proname in ('meet_ai_self_v1_reserve_chunk', 'meet_ai_self_v1_record_decision')")
  if [[ $kept != 2 ]]; then echo "== refused rollback dropped functions ($1)"; status=1; fi
}
guard_sql "insert into auth.users(id) values (u);
  insert into public.users(id) values (u) on conflict do nothing;
  insert into public.workspaces(id, name, personal, creator_id) values (ws, 'Rollback guard', false, u);
  insert into public.workspace_meetings(id, ws_id, creator_id, name) values (m, ws, u, 'Rollback guard');
  perform private.meet_ai_self_v1_start_session(m, u, ws);"
rollback_refused 'live session'
guard_sql "perform private.meet_ai_self_v1_record_decision(sid, u, 'allow', 'v1', 1);
  perform private.meet_ai_self_v1_reserve_chunk(c, sid,
    (select o.stream_id from private.meet_ai_self_v1_open_stream(sid, u, 1, 1) o), u, 0, 0, 0, 1000,
    sha256('guard'::bytea), 1, 1, 1);
  perform private.meet_ai_self_v1_mark_dispatch(c, u, 1);
  perform private.meet_ai_self_v1_stop_session(sid, u, true);"
rollback_refused 'closed session, chunk still reserved'
guard_sql "perform private.meet_ai_self_v1_settle_chunk(c, 'unknown', null, null, null);
  delete from private.meet_ai_consents where session_id = sid;
  delete from public.meet_ai_sessions where id = sid;
  delete from public.workspace_meetings where id = m;
  delete from public.workspaces where id = ws;
  delete from public.users where id = u;
  delete from auth.users where id = u;"

# Rollback round trip, in the documented order, then forward again.
for m in 20261124114200_meet_ai_self_v1_cost_rpcs \
  20261124114100_meet_ai_self_v1_capture_path \
  20261111120208_meet_ai_self_v1_read_contracts \
  20261111120207_validate_meet_ai_self_v1_constraints \
  20261111120206_meet_ai_chunks_stream_identity_guard \
  20261111120205_meet_ai_chunks_timeline_idx \
  20261111120204_meet_ai_chunks_account_session_idx \
  20261111120203_meet_ai_chunks_stream_sequence_key \
  20261111120202_meet_ai_chunks_legacy_sequence_key \
  20261111120201_meet_ai_self_v1_contracts; do
  run "rollbacks/$m.rollback.sql"
done
$PSQL -X -At -v ON_ERROR_STOP=1 -c "alter table public.meet_ai_sessions validate constraint meet_ai_sessions_user_id_fkey"
left=$($PSQL -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and (p.proname like '%self_v1%' or p.proname like 'guard_meet_ai_%')")
cols=$($PSQL -X -At -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.columns
  where table_schema = 'public' and table_name in ('meet_ai_sessions', 'meet_ai_chunks')
    and column_name in ('protocol', 'stream_id', 'capture_consent_revision')")
tables=$($PSQL -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private' and c.relname in ('meet_ai_session_participants', 'meet_ai_capture_streams',
    'meet_ai_erasure_jobs', 'meet_ai_account_fences')")
consents=$($PSQL -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_trigger
  where tgrelid = 'private.meet_ai_consents'::regclass and not tgisinternal")
echo "== rollback functions_left=$left columns_left=$cols tables_left=$tables consent_triggers=$consents (main has 2)"
if [[ $left != 0 || $cols != 0 || $tables != 0 || $consents != 2 ]]; then status=1; fi

forward
echo '== forward again'
suites_pass
exit $status
