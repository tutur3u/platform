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
MIGRATION = ROOT / 'apps/database/supabase/migrations/20261103031000_tutoring_content_stages.sql'

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
        create table public.workspace_configs(ws_id uuid, id text, value text);
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
            self.sql('begin;' + MIGRATION.read_text() + 'commit;')
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules','true' from public.workspace_user_groups")

    # Rows that exist before the stage migration is applied, keyed by test name.
    PRE_MIGRATION = {
        'test_legacy_weak_receipt_becomes_n2_history': "insert into private.tutoring_notification_receipts(kind,group_id,student_user_id,review_cycle_started_at,recipient_user_id,created_at) select 'weak_content_review_due',group_id,user_id,created_at,'00000000-0000-0000-0000-000000000005',now()-interval '14 days' from public.user_feedbacks",
    }

    def pre_migration(self):
        if self._testMethodName == 'test_backfill_excludes_ec_receipts':
            # Reuse the processor's identity rule; never duplicate its raw ID.
            ec = re.search(r"flag.ws_id <> '([^']+)'::uuid", MIGRATION.read_text()).group(1)
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
            pre_run = (ROOT / 'apps/database/verification/tutoring-content-stages-pre-run.sql').read_text()
            # psql emits transaction command tags; request only query rows.
            query = pre_run[pre_run.index('with population'):pre_run.index('commit;')].rstrip().rstrip(';')
            self.assertEqual(self.sql("select string_agg(workspace_segment || ':' || legacy_receipts || ':' || would_change, ',' order by workspace_segment) from (" + query + ") counts"), ['EC:1:0,non-EC:1:1'])
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
        self.run_job(); self.count(0)

    def test_n2_day14_and_dedup(self):
        self.run_job(); self.run_job(); self.count(1)

    def test_n2_day15(self):
        self.sql("update public.user_feedbacks set created_at=now()-interval '15 days'")
        self.run_job(); self.count(1)

    def test_flag_off(self):
        self.sql('delete from public.workspace_configs')
        self.run_job(); self.count(0)

    def test_flag_off_edits_inert(self):
        self.sql("delete from public.workspace_configs; update public.user_feedbacks set content='edited'")
        self.assertEqual(self.sql('select count(*) from private.tutoring_weak_support_reviews'), ['0'])

    def test_ec_excluded(self):
        self.sql("update public.workspace_user_groups set ws_id='42529372-c669-4833-bb32-2cab1f4ffd83'; update public.workspace_users set ws_id='42529372-c669-4833-bb32-2cab1f4ffd83'; update public.workspace_configs set ws_id='42529372-c669-4833-bb32-2cab1f4ffd83'; update public.user_feedbacks set content='edited'")
        self.run_job()
        self.assertEqual(self.sql('select count(*) from private.tutoring_weak_support_reviews'), ['0'])
        self.count(0)

    def test_member_round_trips_preserve_authorized_boundary(self):
        self.sql("insert into private.tutoring_weak_support_reviews values ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003',now()-interval '15 days')")
        before = self.sql('select last_reviewed_at from private.tutoring_weak_support_reviews')
        self.run_job()
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'")
        for change in ["content='edit'", "require_attention=false", "require_attention=true", "content='fixture'"]:
            self.sql('update public.user_feedbacks set '+change)
            self.assertEqual(self.sql('select last_reviewed_at from private.tutoring_weak_support_reviews'), before)
        self.run_job(); self.count(2)

    def test_ec_matrix_linked_recipient(self):
        ec = '42529372-c669-4833-bb32-2cab1f4ffd83'
        for table in ['workspace_user_groups','workspace_users','workspace_configs','workspace_user_linked_users','workspace_members']:
            self.sql(f"update public.{table} set ws_id='{ec}'")
        for enabled in ['false','true']:
            with self.subTest(flag=enabled):
                self.sql(f"update public.workspace_configs set value='{enabled}'")
                for change in ["content='edit'", "require_attention=false", "require_attention=true", "content='fixture'"]:
                    self.sql('update public.user_feedbacks set '+change)
                    self.assertEqual(self.sql('select count(*) from private.tutoring_weak_support_reviews'), ['0'])
                self.run_job(); self.count(0)
                self.assertEqual(self.sql('select count(*) from private.tutoring_notification_receipts'), ['0'])
                self.assertEqual(self.sql('select count(*) from private.tutoring_content_scan_cursor'), ['0'])

    def test_no_teacher(self):
        self.sql('delete from public.workspace_user_linked_users')
        self.run_job(); self.count(0)

    def test_n3_waits_after_n2(self):
        self.run_job(); self.run_job(); self.count(1)
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'")
        self.run_job(); self.run_job(); self.count(2)

    def test_member_edit_does_not_attest_review(self):
        self.run_job()
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'; update public.user_feedbacks set content='updated fixture'")
        self.run_job(); self.count(2)
        self.assertEqual(self.sql('select count(*) from private.tutoring_weak_support_reviews'), ['0'])

    def test_threshold_config(self):
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules_n2_days','15' from public.workspace_user_groups")
        self.run_job(); self.count(0)

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
        self.run_job(); self.count(1)

    def test_n3_threshold_config(self):
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules_n3_days','15' from public.workspace_user_groups")
        self.run_job()
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'")
        self.run_job(); self.count(1)

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
        self.run_job(); self.run_job()
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

    def test_flag_on_only_for_ec_is_off(self):
        ec = '42529372-c669-4833-bb32-2cab1f4ffd83'
        self.sql(f"update public.workspace_configs set ws_id='{ec}'")
        self.assert_no_derived_writes()
        self.sql("insert into private.tutoring_content_scan_cursor values (true, 'ffffffff-ffff-ffff-ffff-fffffffffffe')")
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
        self.run_job(); self.count(1)
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '15 days'")
        self.replace_feedback()
        self.run_job(); self.count(2)
        self.assertEqual(self.sql("select string_agg(stage,',' order by stage) from private.tutoring_notification_receipts"), ['n2,n3'])

    def test_seeded_n2_history_survives_replacement(self):
        # Preexisting N2 history (no processor episode row) keeps its cycle.
        self.seed_review_boundary(30)
        self.sql("insert into private.tutoring_notification_receipts(kind,group_id,student_user_id,review_cycle_started_at,recipient_user_id,stage,created_at) select 'weak_content_review_due',group_id,student_user_id,last_reviewed_at,'00000000-0000-0000-0000-000000000005','n2',now()-interval '15 days' from private.tutoring_weak_support_reviews")
        self.replace_feedback()
        self.run_job(); self.count(1)
        self.assertEqual(self.sql("select count(*) from private.tutoring_notification_receipts where stage='n3' and review_cycle_started_at=(select last_reviewed_at from private.tutoring_weak_support_reviews)"), ['1'])

    def test_replacement_revert_toggle_rows_do_not_postpone(self):
        self.seed_review_boundary(30)
        self.run_job(); self.count(1)
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
        self.run_job(); self.count(0)
        self.replace_feedback()
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules_n2_days','10' from public.workspace_user_groups")
        self.run_job(); self.count(1)

    def test_authorized_review_starts_new_cycle(self):
        self.sql("update public.user_feedbacks set created_at=now()-interval '40 days'")
        self.seed_review_boundary(30)
        self.run_job(); self.count(1)
        # Only the service-role review operation opens a new cycle.
        self.seed_review_boundary(14)
        self.run_job(); self.count(2)
        self.assertEqual(self.sql("select count(distinct review_cycle_started_at) from private.tutoring_notification_receipts where stage='n2'"), ['2'])
        self.seed_review_boundary(0)
        self.replace_feedback()
        self.run_job(); self.count(2)

    def test_future_dated_replacement_cannot_postpone_first_cycle(self):
        self.sql("insert into public.user_feedbacks values (gen_random_uuid(),'00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','future',true,now()+interval '30 days')")
        self.sql("delete from public.user_feedbacks where content='fixture'")
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules_n2_days','1' from public.workspace_user_groups")
        self.run_job(); self.count(0)
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

    def test_backfill_identity_matches_processor(self):
        migration = MIGRATION.read_text()
        ec = re.search(r"flag.ws_id <> '([^']+)'::uuid", migration).group(1)
        digest = hashlib.md5(ec.encode()).hexdigest()
        predicate = "md5(g.ws_id::text) <> '" + digest + "'"
        self.assertIn(predicate, migration)
        pre_run = (ROOT / 'apps/database/verification/tutoring-content-stages-pre-run.sql').read_text()
        self.assertIn("md5(g.ws_id::text) = '" + digest + "'", pre_run)

    def test_backfill_timeouts(self):
        self.assertEqual(self.sql("begin;" + MIGRATION.read_text().split('-- Constant default')[0] + "select current_setting('lock_timeout') || ':' || current_setting('statement_timeout');"), ['5s:30s'])

    def test_backfill_excludes_ec_receipts(self):
        self.assertEqual(self.sql("""
            select string_agg(stage,',' order by group_id)
            from private.tutoring_notification_receipts
        """), ['n2,n1'])
        self.assertEqual(self.sql("""
            select (to_jsonb(r)-'stage')::text || '@' || r.xmin::text
            from private.tutoring_notification_receipts r
            where group_id='00000000-0000-0000-0000-000000000012'
        """), self.ec_receipt_before)

    def test_legacy_weak_receipt_becomes_n2_history(self):
        # A pre-stage weak-content receipt is the teacher alert (N2), never N1.
        self.assertEqual(self.sql("select stage from private.tutoring_notification_receipts"), ['n2'])
        self.run_job(); self.run_job()
        self.assertEqual(self.sql("select string_agg(stage,',' order by stage) from private.tutoring_notification_receipts"), ['n2,n3'])

if __name__ == '__main__':
    unittest.main()
