"""Emit executable pgTAP against the actual rollback guard, using synthetic rows."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
s=(ROOT/'supabase/tests/meet-transcript-erase.sql').read_text()
setup=s[s.index('insert into auth.users'):s.index('create function pg_temp.execute_fixture')]
r=(ROOT/'rollbacks/20261103130000_meet_erase_core.rollback.sql').read_text()
guard=r[r.index('-- Roll back'):r.index('drop trigger')]
print('begin; create extension if not exists pgtap with schema extensions; set local search_path=public,extensions; select no_plan();')
print(setup)
print('delete from private.meet_content_hold_scopes;')
print('create function pg_temp.guard() returns void language plpgsql as $body$ begin '+guard+' end $body$;')
print("select lives_ok('select pg_temp.guard()','empty V10 can roll back');")
print("insert into private.meet_erasure_requests(ws_id,meeting_id,requester_user_id,status) values('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010','on_hold');")
print("select throws_ok('select pg_temp.guard()','P0001','Retain receipts: schema rollback is allowed only before first use','request without operation blocks rollback');")
print('delete from private.meet_erasure_requests;')
print("insert into private.meet_erasure_issuances(operation_key,ws_id,meeting_id,actor_user_id,actor_kind,expires_at,cancelled_at) values(gen_random_uuid(),'00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010','subject',clock_timestamp()+interval '10 seconds',clock_timestamp());")
print("select throws_ok('select pg_temp.guard()','P0001','Retain receipts: schema rollback is allowed only before first use','cancelled issuance blocks rollback');")
print("select is((select count(*) from pg_locks where pid=pg_backend_pid() and mode='AccessExclusiveLock' and granted and relation in (select oid from pg_class where relnamespace='private'::regnamespace and relname in ('meet_content_hold_scopes','meet_erasure_issuances','meet_erasure_operations','meet_erasure_store_progress','meet_erasure_completions','meet_erasure_plans','meet_erasure_requests','meet_transcript_erasures','meet_erasure_events','meet_collaboration_rooms','meet_content_apply_leases'))),11::bigint,'all eleven tables locked');")
print('select * from finish(); rollback;')
