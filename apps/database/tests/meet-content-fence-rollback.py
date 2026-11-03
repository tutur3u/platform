"""Emit pgTAP SQL for the actual rollback guard; pipe to psql -v ON_ERROR_STOP=1."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
rollback = (ROOT / 'apps/database/rollbacks/20261103112400_meet_content_fences.rollback.sql').read_text()
start = rollback.index("set local statement_timeout = '10s';") + len("set local statement_timeout = '10s';")
guard = rollback[start:rollback.index('end$$;') + len('end$$;')]
fixture = (ROOT / 'apps/database/supabase/tests/meet-content-fence.sql').read_text()
# Use the same synthetic meeting/session/chunk fixture as the content suite.
setup = fixture[:fixture.index('create temp table attempt')]
print(setup)
print("select private.read_meeting_document(pg_temp.fid(88703));")
print("create function pg_temp.rollback_guard() returns void language plpgsql as $outer$ begin " + guard + " end $outer$;")
for table, column, value, reset in [
    ('private.meeting_documents', 'installed_doc_generation', '1', '0'),
    ('private.meeting_documents', 'installed_operation_key', 'gen_random_uuid()', 'null'),
    ('public.meet_ai_chunks', 'erasure_generation', '1', '0'),
]:
    print(f"update {table} set {column}={value};")
    print(f"select throws_ok('select pg_temp.rollback_guard()', 'P0001', 'Fence is in use; roll forward', 'rollback refuses {column}');")
    print(f"update {table} set {column}={reset};")
print("""
select lives_ok('select pg_temp.rollback_guard()', 'unused generation permits rollback');
select is((select count(*) from pg_locks
 where pid=pg_backend_pid() and mode='ExclusiveLock' and granted
 and relation in ('private.meet_content_fences'::regclass,
                  'private.meeting_documents'::regclass,
                  'public.meet_ai_chunks'::regclass,
                  'public.meet_ai_sessions'::regclass)), 4::bigint,
 'rollback locks fence and content tables before checking state');
select * from finish();
rollback;
""")
