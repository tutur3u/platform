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
  20261124001000_meet_mira_host_consent
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
  20261125999901_meet_ai_self_v1_pilot_followup
)
# main's meet-ai-consent-schema/-retention suites need main's full parent RLS
# (workspace_meetings policies, creator membership triggers); run them on a
# full replay, not on this minimal parent.
suites=(
  meet-ai-self-v1-schema
  meet-ai-self-v1-read-contract
  meet-ai-self-v1-consent
  meet-ai-self-v1-capture-path
  meet-ai-self-v1-pilot-followup
)
# The consent-proof store (main's erase and sweep migrations) sits between the
# capture path and the follow-up in production order. It is installed once and
# is not part of the self_v1 rollback, so a second forward leaves it alone.
proof=(
  20261124191000_erase_meet_mira_evidence
  20261124191500_sweep_meet_consent_proof_accounts
)
forward() {
  local m p
  for m in "${self_v1[@]}"; do
    case $m in
      2026111112020[2-5]_*) run "supabase/migrations/$m.sql" ;; # CONCURRENTLY: no transaction
      20261125999901_*)
        if [[ $($PSQL -X -At -c "select to_regclass('private.meet_consent_proofs') is null") == t ]]; then
          for p in "${proof[@]}"; do run "supabase/migrations/$p.sql" tx; done
        fi
        run "supabase/migrations/$m.sql" tx ;;
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
    # A skipped test is not a pass: every installed store this lineage names must run.
    if [[ $fail != 0 || $pass == 0 ]] || ! grep -qE '^1\.\.[0-9]+' <<<"$out" \
       || grep -qE 'ERROR|Looks like|# SKIP' <<<"$out"; then
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
rollback_refused() { # rollback_refused <label> <migration>...
  local m out label=$1
  shift
  for m in "$@"; do
    if out=$(run "rollbacks/$m.rollback.sql" 2>&1); then
      echo "== rollback guard MISSING for $m ($label)"; status=1
    elif grep -q 'rolling back' <<<"$out"; then
      echo "== rollback $m refused ($label): $(grep -o '[A-Z][a-z]* [a-z].*rolling back' <<<"$out" | head -1)"
    else
      echo "$out"; status=1
    fi
  done
  kept=$($PSQL -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_proc
    where proname in ('meet_ai_self_v1_reserve_chunk', 'meet_ai_self_v1_record_decision')")
  if [[ $kept != 2 ]]; then echo "== refused rollback dropped functions ($label)"; status=1; fi
}
guard_sql "insert into auth.users(id) values (u);
  insert into public.users(id) values (u) on conflict do nothing;
  insert into public.workspaces(id, name, personal, creator_id) values (ws, 'Rollback guard', false, u);
  insert into public.workspace_meetings(id, ws_id, creator_id, name) values (m, ws, u, 'Rollback guard');
  perform private.meet_ai_self_v1_start_session(m, u, ws);"
rollback_refused 'live session' 20261124114200_meet_ai_self_v1_cost_rpcs \
  20261124114100_meet_ai_self_v1_capture_path
guard_sql "perform private.meet_ai_self_v1_record_decision(sid, u, 'allow', 'v1', 1, 'en',
    encode(sha256('notice'::bytea), 'hex'));
  perform private.meet_ai_self_v1_reserve_chunk(c, sid,
    (select o.stream_id from private.meet_ai_self_v1_open_stream(sid, u, 1, 1) o), u, 0, 0, 0, 1000,
    sha256('guard'::bytea), 1, 1, 1);
  perform private.meet_ai_self_v1_mark_dispatch(c, u, 1);
  perform private.meet_ai_self_v1_stop_session(sid, u, true);"
rollback_refused 'closed session, chunk still reserved, allow evidence recorded' \
  20261125999901_meet_ai_self_v1_pilot_followup 20261124114200_meet_ai_self_v1_cost_rpcs \
  20261124114100_meet_ai_self_v1_capture_path
guard_sql "perform private.meet_ai_self_v1_settle_chunk(c, 'unknown', null, null, null);
  delete from private.meet_ai_consents where session_id = sid;
  delete from public.meet_ai_sessions where id = sid;
  delete from public.workspace_meetings where id = m;
  delete from public.workspaces where id = ws;
  delete from public.users where id = u;
  delete from auth.users where id = u;"

# L1: a late outbox write racing an Auth deletion never leaves a row linked to
# the deleted account. Write first: the deletion waits for it and anonymizes
# it. Deletion first: the write waits and becomes an acknowledged no-op.
race_h=00000000-0000-4000-8000-000000089911; race_a=00000000-0000-4000-8000-000000089912
race_b=00000000-0000-4000-8000-000000089913; race_ws=00000000-0000-4000-8000-000000089914
race_m=00000000-0000-4000-8000-000000089915
race_sid="(select id from public.meet_ai_sessions where meeting_id = '$race_m')"
race_hash="encode(sha256('notice'::bytea), 'hex')"
$PSQL -X -q -v ON_ERROR_STOP=1 -c "insert into auth.users(id) values ('$race_h'), ('$race_a'), ('$race_b');
  insert into public.users(id) values ('$race_h'), ('$race_a'), ('$race_b') on conflict do nothing;
  insert into public.workspaces(id, name, personal, creator_id) values ('$race_ws', 'Race', false, '$race_h');
  insert into public.workspace_meetings(id, ws_id, creator_id, name) values ('$race_m', '$race_ws', '$race_h', 'Race');
  select private.meet_ai_self_v1_start_session('$race_m', '$race_h', '$race_ws');
  select private.meet_ai_self_v1_record_decision($race_sid, u, 'allow', 'v1', 1, 'en', $race_hash)
    from unnest(array['$race_a', '$race_b']::uuid[]) u;" >/dev/null
$PSQL -X -q -v ON_ERROR_STOP=1 -c "begin;
  select private.meet_ai_self_v1_record_decision($race_sid, '$race_a', 'withdraw', 'v1', 2);
  select pg_sleep(2); commit;" >/dev/null &
race_pid=$!
sleep 0.5
$PSQL -X -q -v ON_ERROR_STOP=1 -c "delete from auth.users where id = '$race_a'"
wait $race_pid
$PSQL -X -q -v ON_ERROR_STOP=1 -c "begin; delete from auth.users where id = '$race_b';
  select pg_sleep(2); commit;" >/dev/null &
race_pid=$!
sleep 0.5
race_late=$($PSQL -X -At -v ON_ERROR_STOP=1 -c "select recorded
  from private.meet_ai_self_v1_record_decision($race_sid, '$race_b', 'withdraw', 'v1', 2)")
wait $race_pid
race_linked=$($PSQL -X -At -v ON_ERROR_STOP=1 -c "select
  (select count(*) from private.meet_ai_consents where user_id in ('$race_a', '$race_b'))
  + (select count(*) from private.meet_ai_self_v1_room_ops where account_id in ('$race_a', '$race_b'))")
race_rows=$($PSQL -X -At -v ON_ERROR_STOP=1 -c "select count(*) from private.meet_ai_consents
  where session_id = $race_sid")
echo "== L1 race: linked_rows=$race_linked consent_rows=$race_rows (want 0 and 3) late_write_recorded=$race_late (want f)"
if [[ $race_linked != 0 || $race_rows != 3 || $race_late != f ]]; then status=1; fi
$PSQL -X -q -v ON_ERROR_STOP=1 -c "select private.meet_ai_self_v1_stop_session($race_sid, '$race_h', true);
  delete from private.meet_ai_consents where session_id = $race_sid;
  delete from public.meet_ai_sessions where meeting_id = '$race_m';
  delete from public.workspace_meetings where id = '$race_m';
  delete from public.workspaces where id = '$race_ws';
  delete from public.users where id in ('$race_h', '$race_a', '$race_b');
  delete from auth.users where id = '$race_h';" >/dev/null

# Rollback round trip, in the documented order, then forward again.
for m in 20261125999901_meet_ai_self_v1_pilot_followup \
  20261124114200_meet_ai_self_v1_cost_rpcs \
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
added=$($PSQL -X -At -v ON_ERROR_STOP=1 -c "select count(*) from information_schema.columns
  where table_schema = 'private' and ((table_name = 'meet_ai_consents' and column_name in ('locale', 'text_hash'))
    or (table_name = 'meet_mira_participant_choices' and column_name in ('notice_mode', 'pending_id')))")
consents=$($PSQL -X -At -v ON_ERROR_STOP=1 -c "select count(*) from pg_trigger
  where tgrelid = 'private.meet_ai_consents'::regclass and not tgisinternal")
echo "== rollback functions_left=$left columns_left=$cols added_columns_left=$added tables_left=$tables consent_triggers=$consents (main has 2)"
if [[ $left != 0 || $cols != 0 || $added != 0 || $tables != 0 || $consents != 2 ]]; then status=1; fi

forward
echo '== forward again'
suites_pass
exit $status
