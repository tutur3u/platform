"""Fixture-only PostgreSQL tests. No remote DSN is accepted; requires local PG17.

Set TUTORING_PG_BIN to another local PostgreSQL bin directory when PG17 is not
installed at the Homebrew path. The real-schema replay is a separate harness.
"""
import hashlib
import os
import pathlib
import re
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
PG = pathlib.Path(os.environ.get('TUTORING_PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
MIGRATION = ROOT / 'apps/database/supabase/migrations/20261104221000_tutoring_content_stages.sql'
PRE_RUN = ROOT / 'apps/database/verification/tutoring-content-stages-pre-run.sql'
# MD5 of the client workspace that only its own admins may opt in. Migrations and
# backfills must always exclude it; the raw ID is never used as a fixture here.
CLIENT_WS_MD5 = 'c736c4be0acb08f8625bb5ebe9ad8fe2'
# Synthetic stand-in for that workspace in behavioural backfill tests only.
SYNTH_EXCLUDED_WS = '00000000-0000-4000-8000-0000000000e1'
# Second synthetic workspace for per-workspace opt-in scoping.
OTHER_WS = '00000000-0000-0000-0000-000000000021'

class ContentRules(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Unix socket paths are limited to ~103 bytes; TUTORING_TMP shortens them.
        base = pathlib.Path(os.environ.get('TUTORING_TMP', ROOT / '.tmp'))
        base.mkdir(exist_ok=True)
        cls.tmp = tempfile.TemporaryDirectory(dir=base)
        cls.path = pathlib.Path(cls.tmp.name)
        subprocess.run([PG / 'initdb', '-D', cls.path / 'db', '-A', 'trust'], check=True, stdout=subprocess.DEVNULL)
        subprocess.run([PG / 'pg_ctl', '-D', cls.path / 'db', '-l', cls.path / 'log', '-o', f'-k {cls.path} -p 55439 -c listen_addresses=', 'start'], check=True, stdout=subprocess.DEVNULL)
        cls.sql('create role anon; create role authenticated; create role service_role;')

    @classmethod
    def tearDownClass(cls):
        subprocess.run([PG / 'pg_ctl', '-D', cls.path / 'db', 'stop', '-m', 'fast'], check=True, stdout=subprocess.DEVNULL)
        cls.tmp.cleanup()

    @classmethod
    def sql(cls, sql):
        result = subprocess.run([PG / 'psql', '-h', cls.path, '-p', '55439', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], input=sql, text=True, capture_output=True)
        if result.returncode:
            raise AssertionError(result.stderr)
        return result.stdout.strip().splitlines()[-1:]

    def setUp(self):
        self.sql("""
        drop schema if exists private cascade; drop schema public cascade;
        create schema public; create schema private;
        create table public.workspace_configs(ws_id uuid, id text, value text, updated_at timestamptz not null default now());
        create table public.workspace_user_groups(id uuid primary key, ws_id uuid);
        create table public.workspace_users(id uuid primary key, ws_id uuid);
        create table public.workspace_user_groups_users(group_id uuid,user_id uuid,role text);
        create table public.workspace_user_linked_users(ws_id uuid,virtual_user_id uuid,platform_user_id uuid);
        create table public.workspace_members(ws_id uuid,user_id uuid);
        create function public.has_workspace_permission(uuid,uuid,text) returns boolean language sql as $$select $3 = 'approve_reports'$$;
        create table public.user_feedbacks(id uuid,user_id uuid,group_id uuid,content text,require_attention boolean,created_at timestamptz);
        create table private.tutoring_weak_support_reviews(group_id uuid,student_user_id uuid,last_reviewed_at timestamptz,primary key(group_id,student_user_id));
        create table public.notifications(id uuid default gen_random_uuid(), ws_id uuid,user_id uuid,type text,code text,title text,description text,scope text,entity_type text,entity_id uuid,data jsonb);
        create table private.tutoring_notification_receipts(id uuid default gen_random_uuid(),kind text,group_id uuid,student_user_id uuid,review_cycle_started_at timestamptz,recipient_user_id uuid,notification_id uuid,created_at timestamptz default now(),tutoring_session_id uuid,
        constraint tutoring_notification_receipts_review_key unique(group_id,student_user_id,review_cycle_started_at,recipient_user_id),
        unique(tutoring_session_id,recipient_user_id));
        insert into public.workspace_user_groups values ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001');
        insert into public.workspace_users values ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001');
        insert into public.workspace_user_groups_users values ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','STUDENT'),('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000004','TEACHER');
        insert into public.workspace_user_linked_users values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005');
        insert into public.workspace_members values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005');
        insert into public.user_feedbacks values (gen_random_uuid(),'00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','fixture',true,now()-interval '14 days');
        """)
        self.pre_migration()
        if MIGRATION.exists():
            self.apply_migration()
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules','true',now()-interval '60 days' from public.workspace_user_groups")

    # Rows that exist before the stage migration is applied, keyed by test name.
    PRE_MIGRATION = {
        'test_legacy_weak_receipt_becomes_n2_history': "insert into private.tutoring_notification_receipts(kind,group_id,student_user_id,review_cycle_started_at,recipient_user_id,created_at) select 'weak_content_review_due',group_id,user_id,created_at,'00000000-0000-0000-0000-000000000005',now()-interval '14 days' from public.user_feedbacks",
    }

    BACKFILL_TESTS = {'test_backfill_excludes_client_receipts'}

    def migration_text(self):
        text = MIGRATION.read_text()
        if self._testMethodName in self.BACKFILL_TESTS:
            # Point the exclusion at a synthetic workspace; the constant test
            # below pins the real migration text to CLIENT_WS_MD5.
            text = text.replace(CLIENT_WS_MD5, hashlib.md5(SYNTH_EXCLUDED_WS.encode(), usedforsecurity=False).hexdigest())
        return text

    def configs_snapshot(self):
        return self.sql("select count(*)::text || ':' || coalesce(md5(string_agg(t::text || '@' || t.xmin::text, ',' order by t::text)), '-') from public.workspace_configs t")

    def apply_migration(self):
        self.configs_before_migration = self.configs_snapshot()
        self.sql('begin;' + self.migration_text() + 'commit;')
        self.configs_after_migration = self.configs_snapshot()

    def pre_migration(self):
        if self._testMethodName == 'test_migration_writes_no_workspace_configs':
            # Existing opt-in rows (none 'true') must be left byte-for-byte alone.
            self.sql(f"""
                insert into public.workspace_configs values
                  ('00000000-0000-0000-0000-000000000001','tutoring_content_rules','false'),
                  ('{OTHER_WS}','tutoring_content_rules_n2_days','10'),
                  ('{SYNTH_EXCLUDED_WS}','UNRELATED','x');
            """)
        if self._testMethodName in self.BACKFILL_TESTS:
            ec = SYNTH_EXCLUDED_WS
            self.sql(f"""
                insert into public.workspace_user_groups values
                  ('00000000-0000-0000-0000-000000000012','{ec}') on conflict do nothing;
                insert into private.tutoring_notification_receipts
                  (kind,group_id,student_user_id,review_cycle_started_at,recipient_user_id)
                values
                  ('weak_content_review_due','00000000-0000-0000-0000-000000000012',
                   '00000000-0000-0000-0000-000000000003',now(),
                   '00000000-0000-0000-0000-000000000005'),
                  ('weak_content_review_due','00000000-0000-0000-0000-000000000002',
                   '00000000-0000-0000-0000-000000000003',now(),
                   '00000000-0000-0000-0000-000000000005');
            """)
            pre_run = PRE_RUN.read_text().replace(CLIENT_WS_MD5, hashlib.md5(ec.encode(), usedforsecurity=False).hexdigest())
            # psql emits transaction command tags; request only query rows.
            query = pre_run[pre_run.index('with population'):pre_run.index('commit;')].rstrip().rstrip(';')
            self.assertEqual(self.sql("select string_agg(workspace_segment || ':' || legacy_receipts || ':' || would_change, ',' order by workspace_segment) from (" + query + ") counts"), ['excluded:1:0,other:1:1'])
            self.ec_receipt_before = self.sql("""
                select (to_jsonb(r)-'stage')::text || '@' || r.xmin::text
                from private.tutoring_notification_receipts r
                where group_id='00000000-0000-0000-0000-000000000012'
            """)
        seed = self.PRE_MIGRATION.get(self._testMethodName)
        if seed:
            self.sql(seed)

    def run_job(self):
        self.sql('select private.process_tutoring_content_rules(1000)')

    def count(self, expected):
        self.assertEqual(self.sql('select count(*) from public.notifications'), [str(expected)])

    def test_notification_entity_uuid(self):
        self.run_job()
        self.assertEqual(self.sql("select pg_typeof(entity_id)::text || ':' || entity_id::text from public.notifications"), ['uuid:00000000-0000-0000-0000-000000000002'])

    def test_n2_day13(self):
        self.sql("update public.user_feedbacks set created_at=now()-interval '13 days'")
        self.run_job()
        self.count(0)

    def test_n2_day14_and_dedup(self):
        self.run_job()
        self.run_job()
        self.count(1)

    def test_n2_day15(self):
        self.sql("update public.user_feedbacks set created_at=now()-interval '15 days'")
        self.run_job()
        self.count(1)

    def test_flag_off(self):
        self.sql('delete from public.workspace_configs')
        self.run_job()
        self.count(0)

    def test_flag_off_edits_inert(self):
        self.sql("delete from public.workspace_configs; update public.user_feedbacks set content='edited'")
        self.assertEqual(self.sql('select count(*) from private.tutoring_weak_support_reviews'), ['0'])


    def test_member_round_trips_preserve_authorized_boundary(self):
        self.sql("insert into private.tutoring_weak_support_reviews values ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',now()-interval '15 days')")
        before = self.sql('select last_reviewed_at from private.tutoring_weak_support_reviews')
        self.run_job()
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'")
        for change in ["content='edit'", "require_attention=false", "require_attention=true", "content='fixture'"]:
            self.sql('update public.user_feedbacks set '+change)
            self.assertEqual(self.sql('select last_reviewed_at from private.tutoring_weak_support_reviews'), before)
        self.run_job()
        self.count(2)


    def test_no_teacher(self):
        self.sql('delete from public.workspace_user_linked_users')
        self.run_job()
        self.count(0)

    def test_n3_waits_after_n2(self):
        self.run_job()
        self.run_job()
        self.count(1)
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'")
        self.run_job()
        self.run_job()
        self.count(2)

    def test_member_edit_does_not_attest_review(self):
        self.run_job()
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'; update public.user_feedbacks set content='updated fixture'")
        self.run_job()
        self.count(2)
        self.assertEqual(self.sql('select count(*) from private.tutoring_weak_support_reviews'), ['0'])

    def test_threshold_config(self):
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules_n2_days','15' from public.workspace_user_groups")
        self.run_job()
        self.count(0)

    def test_stage_isolation(self):
        self.run_job()
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'")
        self.run_job()
        self.assertEqual(self.sql("select string_agg(stage,',' order by stage) from private.tutoring_notification_receipts"), ['n2,n3'])

    def test_rollback_preserves_stage_history(self):
        self.run_job()
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'")
        self.run_job()
        self.sql((ROOT / 'apps/database/rollbacks/20261103031000_tutoring_content_stages.rollback.sql').read_text())
        self.assertEqual(self.sql('select count(*) from private.tutoring_notification_receipts'), ['2'])
        self.assertEqual(self.sql('select count(*) from private.tutoring_content_stage_backup'), ['2'])
        self.assertEqual(self.sql("select to_regprocedure('private.process_tutoring_content_rules(integer)') is null"), ['t'])
        self.sql("update public.user_feedbacks set content='after rollback'")
        self.assertEqual(self.sql('select count(*) from private.tutoring_weak_support_reviews'), ['0'])

    def test_office_override_unset_group(self):
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules_office_group','disabled' from public.workspace_user_groups")
        self.run_job()
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'")
        self.run_job()
        self.count(1)

    def test_n3_threshold_config(self):
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules_n3_days','15' from public.workspace_user_groups")
        self.run_job()
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'")
        self.run_job()
        self.count(1)

    def test_service_role_only(self):
        self.assertEqual(self.sql("select has_function_privilege('authenticated','private.process_tutoring_content_rules(integer)','execute')"), ['f'])
        self.assertEqual(self.sql("select has_function_privilege('service_role','private.process_tutoring_content_rules(integer)','execute')"), ['t'])

    def test_n1_receipt_dedup(self):
        self.sql("insert into private.tutoring_notification_receipts(kind,tutoring_session_id,recipient_user_id) values ('session_completed',gen_random_uuid(),gen_random_uuid())")
        self.sql('insert into private.tutoring_notification_receipts(kind,tutoring_session_id,recipient_user_id) select kind,tutoring_session_id,recipient_user_id from private.tutoring_notification_receipts on conflict do nothing')
        self.assertEqual(self.sql('select count(*) from private.tutoring_notification_receipts'), ['1'])
        self.assertEqual(self.sql('select stage from private.tutoring_notification_receipts'), ['n1'])

    # Every table the processor may write. Absent tables are reported as such so
    # a snapshot compares equal only when nothing derived was created or changed.
    DERIVED = ['private.tutoring_content_scan_cursor', 'private.tutoring_notification_receipts',
               'public.notifications', 'private.tutoring_weak_support_reviews',
               'private.tutoring_content_review_episodes']

    def derived_snapshot(self):
        snapshot = {}
        for table in self.DERIVED:
            exists = self.sql(f"select to_regclass('{table}') is not null")
            if exists != ['t']:
                snapshot[table] = 'absent'
                continue
            # xmin exposes even a no-op UPDATE (for example after_id null -> null).
            snapshot[table] = self.sql(
                f"select count(*)::text || ':' || coalesce(md5(string_agg(t::text || '@' || t.xmin::text, ',' order by t::text)), '-') from {table} t")
        return snapshot

    def assert_no_derived_writes(self):
        before = self.derived_snapshot()
        self.run_job()
        self.run_job()
        self.assertEqual(self.derived_snapshot(), before)

    def test_flag_off_no_derived_writes_empty_cursor(self):
        self.sql('delete from public.workspace_configs')
        self.assertEqual(self.sql('select count(*) from private.tutoring_content_scan_cursor'), ['0'])
        self.assert_no_derived_writes()
        self.assertEqual(self.sql('select count(*) from private.tutoring_content_scan_cursor'), ['0'])

    def test_flag_off_no_derived_writes_seeded_cursor(self):
        self.sql("delete from public.workspace_configs; insert into private.tutoring_content_scan_cursor values (true, 'ffffffff-ffff-ffff-ffff-fffffffffffe')")
        self.assert_no_derived_writes()
        self.assertEqual(self.sql('select after_id from private.tutoring_content_scan_cursor'), ['ffffffff-ffff-ffff-ffff-fffffffffffe'])

    def test_flag_off_no_derived_writes_seeded_null_cursor(self):
        self.sql('delete from public.workspace_configs; insert into private.tutoring_content_scan_cursor values (true, null)')
        self.assert_no_derived_writes()

    def test_flag_non_true_values_are_off(self):
        for value in ['false', 'TRUE', ' true', '1', '']:
            with self.subTest(value=value):
                self.sql(f"update public.workspace_configs set value='{value}'")
                self.assert_no_derived_writes()


    def seed_review_boundary(self, days_ago):
        self.sql(f"insert into private.tutoring_weak_support_reviews values ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',now()-interval '{days_ago} days') on conflict (group_id,student_user_id) do update set last_reviewed_at=excluded.last_reviewed_at")

    def replace_feedback(self, attention='true', content='fixture'):
        # The API POST inserts a new row instead of editing in place.
        self.sql(f"insert into public.user_feedbacks values (gen_random_uuid(),'00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','{content}',{attention},now())")

    def test_replacement_feedback_keeps_cycle_for_n3(self):
        # Selene M1: boundary day -30, N2 receipt day -15, replacement row today.
        self.sql("update public.user_feedbacks set created_at=now()-interval '40 days'")
        self.seed_review_boundary(30)
        self.run_job()
        self.count(1)
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '15 days'")
        self.replace_feedback()
        self.run_job()
        self.count(2)
        self.assertEqual(self.sql("select string_agg(stage,',' order by stage) from private.tutoring_notification_receipts"), ['n2,n3'])

    def test_seeded_n2_history_survives_replacement(self):
        # Preexisting N2 history (no processor episode row) keeps its cycle.
        self.seed_review_boundary(30)
        self.sql("insert into private.tutoring_notification_receipts(kind,group_id,student_user_id,review_cycle_started_at,recipient_user_id,stage,created_at) select 'weak_content_review_due',group_id,student_user_id,last_reviewed_at,'00000000-0000-0000-0000-000000000005','n2',now()-interval '15 days' from private.tutoring_weak_support_reviews")
        self.replace_feedback()
        self.run_job()
        self.count(1)
        self.assertEqual(self.sql("select count(*) from private.tutoring_notification_receipts where stage='n3' and review_cycle_started_at=(select last_reviewed_at from private.tutoring_weak_support_reviews)"), ['1'])

    def test_replacement_revert_toggle_rows_do_not_postpone(self):
        self.seed_review_boundary(30)
        self.run_job()
        self.count(1)
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '15 days'")
        for attention, content in [('true', 'edited'), ('false', 'edited'), ('true', 'fixture'), ('true', 'fixture')]:
            self.replace_feedback(attention, content)
            self.run_job()
        self.count(2)
        self.assertEqual(self.sql("select count(distinct review_cycle_started_at) from private.tutoring_notification_receipts"), ['1'])
        before = self.sql('select last_reviewed_at from private.tutoring_weak_support_reviews')
        self.sql("update public.user_feedbacks set content='in place', require_attention=true")
        self.assertEqual(self.sql('select last_reviewed_at from private.tutoring_weak_support_reviews'), before)

    def test_replacement_before_n2_does_not_postpone_n2(self):
        self.sql("update public.user_feedbacks set created_at=now()-interval '10 days'")
        self.run_job()
        self.count(0)
        self.replace_feedback()
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules_n2_days','10' from public.workspace_user_groups")
        self.run_job()
        self.count(1)

    def test_authorized_review_starts_new_cycle(self):
        self.sql("update public.user_feedbacks set created_at=now()-interval '40 days'")
        self.seed_review_boundary(30)
        self.run_job()
        self.count(1)
        # Only the service-role review operation opens a new cycle.
        self.seed_review_boundary(14)
        self.run_job()
        self.count(2)
        self.assertEqual(self.sql("select count(distinct review_cycle_started_at) from private.tutoring_notification_receipts where stage='n2'"), ['2'])
        self.seed_review_boundary(0)
        self.replace_feedback()
        self.run_job()
        self.count(2)

    def test_future_dated_replacement_cannot_postpone_first_cycle(self):
        self.sql("insert into public.user_feedbacks values (gen_random_uuid(),'00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','future',true,now()+interval '30 days')")
        self.sql("delete from public.user_feedbacks where content='fixture'")
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules_n2_days','1' from public.workspace_user_groups")
        self.run_job()
        self.count(0)
        self.assertEqual(self.sql("select count(*) from private.tutoring_content_review_episodes where cycle_started_at<=now()"), ['1'])

    def test_rollback_phase1_survives_backup_failure(self):
        self.run_job()
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'")
        self.run_job()
        # Disposable injected failure: an incompatible pre-existing backup table.
        self.sql('create table private.tutoring_content_stage_backup(id uuid check (false))')
        rollback = (ROOT / 'apps/database/rollbacks/20261103031000_tutoring_content_stages.rollback.sql').read_text()
        with self.assertRaises(AssertionError):
            self.sql(rollback)
        self.assertEqual(self.sql("select to_regprocedure('private.process_tutoring_content_rules(integer)') is null"), ['t'])
        self.assertEqual(self.sql('select count(*) from private.tutoring_content_stage_backup'), ['0'])
        self.assertEqual(self.sql('select count(*) from private.tutoring_notification_receipts'), ['2'])
        self.sql('drop table private.tutoring_content_stage_backup')
        self.sql(rollback)
        self.assertEqual(self.sql('select count(*) from (select * from private.tutoring_notification_receipts except select * from private.tutoring_content_stage_backup) d'), ['0'])
        self.assertEqual(self.sql('select count(*) from private.tutoring_content_stage_backup'), ['2'])


    def test_backfill_timeouts(self):
        self.assertEqual(self.sql("begin;" + MIGRATION.read_text().split('-- Constant default')[0] + "select current_setting('lock_timeout') || ':' || current_setting('statement_timeout');"), ['5s:30s'])

    def test_backfill_excludes_client_receipts(self):
        self.assertEqual(self.sql("""
            select string_agg(stage,',' order by group_id)
            from private.tutoring_notification_receipts
        """), ['n2,n1'])
        self.assertEqual(self.sql("""
            select (to_jsonb(r)-'stage')::text || '@' || r.xmin::text
            from private.tutoring_notification_receipts r
            where group_id='00000000-0000-0000-0000-000000000012'
        """), self.ec_receipt_before)

    # Opt-in contract on synthetic workspaces: only the workspace's own literal
    # 'true' enables writes; absent or any other value writes nothing.
    def add_workspace(self, ws, n):
        group, student, teacher, platform = (f'00000000-0000-0000-0000-0000000000{n}{i}' for i in range(2, 6))
        # The real-DDL harness has FK parents for workspaces and platform users.
        self.sql(f"""do $x$ begin
            if to_regclass('public.workspaces') is not null then
              execute 'insert into public.workspaces(id) values (''{ws}'') on conflict do nothing';
              execute 'insert into public.users(id) values (''{platform}'') on conflict do nothing';
            end if; end $x$;""")
        self.sql(f"""
            insert into public.workspace_user_groups values ('{group}','{ws}');
            insert into public.workspace_users values ('{student}','{ws}');
            insert into public.workspace_user_groups_users values ('{group}','{student}','STUDENT'),('{group}','{teacher}','TEACHER');
            insert into public.workspace_user_linked_users values ('{ws}','{teacher}','{platform}');
            insert into public.workspace_members values ('{ws}','{platform}');
            insert into public.user_feedbacks values (gen_random_uuid(),'{student}','{group}','fixture',true,now()-interval '14 days');
        """)

    def ws_rows(self, ws):
        return self.sql(f"""select (select count(*) from public.notifications where ws_id='{ws}') || ':' ||
            (select count(*) from private.tutoring_notification_receipts r join public.workspace_user_groups g on g.id=r.group_id where g.ws_id='{ws}') || ':' ||
            (select count(*) from private.tutoring_content_review_episodes e join public.workspace_user_groups g on g.id=e.group_id where g.ws_id='{ws}')""")

    def test_optin_absent_writes_nothing(self):
        self.sql("delete from public.workspace_configs where id='tutoring_content_rules'")
        self.assert_no_derived_writes()
        self.assertEqual(self.ws_rows('00000000-0000-0000-0000-000000000001'), ['0:0:0'])

    def test_optin_true_writes(self):
        self.run_job()
        self.assertEqual(self.ws_rows('00000000-0000-0000-0000-000000000001'), ['1:1:1'])

    def test_optin_other_values_write_nothing(self):
        for value in ['false', 'TRUE', 'True', ' true', 'true ', '1', 'yes', 'on', '']:
            with self.subTest(value=value):
                self.sql(f"update public.workspace_configs set value='{value}' where id='tutoring_content_rules'")
                self.assert_no_derived_writes()
                self.assertEqual(self.ws_rows('00000000-0000-0000-0000-000000000001'), ['0:0:0'])

    def test_optin_is_per_workspace(self):
        self.add_workspace(OTHER_WS, 3)
        for value in [None, 'false', 'yes']:
            with self.subTest(other=value):
                self.sql(f"delete from public.workspace_configs where ws_id='{OTHER_WS}'")
                if value is not None:
                    self.sql(f"insert into public.workspace_configs values ('{OTHER_WS}','tutoring_content_rules','{value}')")
                self.run_job()
                self.assertEqual(self.ws_rows(OTHER_WS), ['0:0:0'])
        self.assertEqual(self.ws_rows('00000000-0000-0000-0000-000000000001'), ['1:1:1'])
        # A fresh opt-in cannot alert the other workspace's older episode.
        self.sql(f"update public.workspace_configs set value='true',updated_at=now() where ws_id='{OTHER_WS}'")
        self.run_job()
        self.assertEqual(self.ws_rows(OTHER_WS), ['0:0:1'])
        self.assertEqual(self.ws_rows('00000000-0000-0000-0000-000000000001'), ['1:1:1'])

    def test_episode_at_optin_boundary_can_receive_n2(self):
        self.sql("update public.workspace_configs set updated_at=now()-interval '14 days' where id='tutoring_content_rules'")
        self.sql("update public.user_feedbacks set created_at=(select updated_at from public.workspace_configs where id='tutoring_content_rules')")
        self.run_job()
        self.count(1)

    def test_pre_optin_episode_gets_no_fresh_n2(self):
        self.sql("update public.workspace_configs set updated_at=now() where id='tutoring_content_rules'")
        self.run_job()
        self.run_job()
        self.count(0)
        self.assertEqual(self.sql("select count(*) from private.tutoring_notification_receipts"), ['0'])
        # A replacement must retain the pinned old episode, even if dated later.
        self.replace_feedback()
        self.run_job()
        self.count(0)
        # A later authorized review opens an eligible episode.
        self.sql("update public.workspace_configs set updated_at=now()-interval '2 days' where id='tutoring_content_rules'")
        self.seed_review_boundary(1)
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules_n2_days','1' from public.workspace_user_groups")
        self.sql("update public.user_feedbacks set created_at=now()-interval '14 days'")
        self.run_job()
        self.count(1)

    def test_legacy_n1_episode_before_optin_stays_n1(self):
        self.sql("update public.workspace_configs set updated_at=now() where id='tutoring_content_rules'")
        self.sql("insert into private.tutoring_notification_receipts(kind,group_id,student_user_id,review_cycle_started_at,recipient_user_id,stage) select 'weak_content_review_due',group_id,user_id,created_at,'00000000-0000-0000-0000-000000000005','n1' from public.user_feedbacks")
        before = self.sql("select r::text || '@' || r.xmin::text from private.tutoring_notification_receipts r")
        self.run_job()
        self.run_job()
        self.count(0)
        self.assertEqual(self.sql("select r::text || '@' || r.xmin::text from private.tutoring_notification_receipts r"), before)

    def test_pre_optin_n2_history_can_progress_but_no_new_teacher_n2(self):
        self.run_job()
        self.count(1)
        self.sql("update public.workspace_configs set updated_at=now() where id='tutoring_content_rules'")
        self.sql("delete from private.tutoring_notification_receipts")
        self.run_job()
        self.count(1)
        self.sql("insert into private.tutoring_notification_receipts(kind,group_id,student_user_id,review_cycle_started_at,recipient_user_id,stage,created_at) select 'weak_content_review_due',group_id,student_user_id,cycle_started_at,'00000000-0000-0000-0000-000000000005','n2',now()-interval '15 days' from private.tutoring_content_review_episodes")
        self.run_job()
        self.count(2)
        self.assertEqual(self.sql("select count(*) from private.tutoring_notification_receipts where stage='n3'"), ['1'])

    @staticmethod
    def migration_code():
        return re.sub(r'--[^\n]*', '', MIGRATION.read_text())

    def test_migration_writes_no_workspace_configs(self):
        self.assertEqual(self.configs_after_migration, self.configs_before_migration)
        # Seeded rows were present (the real-DDL harness applies twice, so >=).
        self.assertGreaterEqual(int(self.configs_before_migration[0].split(':')[0]), 3)
        text = self.migration_code().lower()
        self.assertIsNone(re.search(r'(insert\s+into|update|delete\s+from|merge\s+into|truncate)\s+(public\.)?workspace_configs', text))
        # workspace_configs is only read, inside the runtime function body.
        outside = text[:text.index('as $$')] + text[text.index('end $$'):]
        self.assertNotIn('workspace_configs', outside)
        self.assertNotIn('tutoring_content_scan_cursor(singleton', outside.replace(' ', ''))

    def test_migration_excludes_client_workspace_at_apply_time(self):
        text = self.migration_code()
        body = text[text.index('as $$'):text.index('end $$')]
        # Runtime: the opt-in is the only gate, no hard-coded workspace exclusion.
        self.assertNotIn(CLIENT_WS_MD5, body)
        self.assertIsNone(re.search(r'ws_id\s*<>', body))
        # Apply time: the only data-touching statement excludes the client workspace.
        outside = text[:text.index('as $$')] + text[text.index('end $$'):]
        dml = re.findall(r'^\s*(?:insert\s+into|update|delete\s+from|merge\s+into)\b[^;]*;', outside, re.I | re.M)
        self.assertEqual(len(dml), 1, dml)
        self.assertIn("md5(g.ws_id::text) <> '" + CLIENT_WS_MD5 + "'", dml[0])
        self.assertIn("md5(g.ws_id::text) = '" + CLIENT_WS_MD5 + "'", PRE_RUN.read_text())

    def test_legacy_weak_receipt_becomes_n2_history(self):
        # A pre-stage weak-content receipt is the teacher alert (N2), never N1.
        self.assertEqual(self.sql("select stage from private.tutoring_notification_receipts"), ['n2'])
        self.run_job()
        self.run_job()
        self.assertEqual(self.sql("select string_agg(stage,',' order by stage) from private.tutoring_notification_receipts"), ['n2,n3'])

if __name__ == '__main__':
    unittest.main()
