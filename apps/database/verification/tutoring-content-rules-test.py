"""Fixture-only PostgreSQL tests. No remote DSN is accepted; requires local PG17."""
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
PG = pathlib.Path('/opt/homebrew/opt/postgresql@17/bin')
MIGRATION = ROOT / 'apps/database/supabase/migrations/20261103031000_tutoring_content_stages.sql'

class ContentRules(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(dir=ROOT / '.tmp')
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
        create table public.workspace_user_groups(id uuid, ws_id uuid);
        create table public.workspace_users(id uuid, ws_id uuid);
        create table public.workspace_user_groups_users(group_id uuid,user_id uuid,role text);
        create table public.workspace_user_linked_users(ws_id uuid,virtual_user_id uuid,platform_user_id uuid);
        create table public.workspace_members(ws_id uuid,user_id uuid);
        create function public.has_workspace_permission(uuid,uuid,text) returns boolean language sql as $$select $3 = 'approve_reports'$$;
        create table public.user_feedbacks(id uuid,user_id uuid,group_id uuid,content text,require_attention boolean,created_at timestamptz);
        create table private.tutoring_weak_support_reviews(group_id uuid,student_user_id uuid,last_reviewed_at timestamptz,primary key(group_id,student_user_id));
        create table public.notifications(id uuid default gen_random_uuid(), ws_id uuid,user_id uuid,type text,code text,title text,description text,scope text,entity_type text,entity_id text,data jsonb);
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
        if MIGRATION.exists():
            self.sql('begin;' + MIGRATION.read_text() + 'commit;')
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules','true' from public.workspace_user_groups")

    def run_job(self):
        self.sql('select private.process_tutoring_content_rules(1000)')

    def count(self, expected):
        self.assertEqual(self.sql('select count(*) from public.notifications'), [str(expected)])

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

    def test_no_teacher(self):
        self.sql('delete from public.workspace_user_linked_users')
        self.run_job(); self.count(0)

    def test_n3_waits_after_n2(self):
        self.run_job(); self.run_job(); self.count(1)
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'")
        self.run_job(); self.run_job(); self.count(2)

    def test_update_resets(self):
        self.run_job()
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'; update public.user_feedbacks set content='updated fixture'")
        self.run_job(); self.count(1)

    def test_threshold_config(self):
        self.sql("insert into public.workspace_configs select ws_id,'tutoring_content_rules_n2_days','15' from public.workspace_user_groups")
        self.run_job(); self.count(0)

    def test_stage_isolation(self):
        self.run_job()
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'")
        self.run_job()
        self.assertEqual(self.sql("select string_agg(stage,',' order by stage) from private.tutoring_notification_receipts"), ['n2,n3'])

    def test_rollback_empty(self):
        self.sql((ROOT / 'apps/database/rollbacks/20261103031000_tutoring_content_stages.rollback.sql').read_text())
        self.assertEqual(self.sql("select count(*) from information_schema.columns where table_schema='private' and table_name='tutoring_notification_receipts' and column_name='stage'"), ['0'])

    def test_rollback_preserves_stage_history(self):
        self.run_job()
        self.sql("update private.tutoring_notification_receipts set created_at=now()-interval '14 days'")
        self.run_job()
        with self.assertRaises(AssertionError):
            self.sql((ROOT / 'apps/database/rollbacks/20261103031000_tutoring_content_stages.rollback.sql').read_text())
        self.assertEqual(self.sql('select count(*) from private.tutoring_notification_receipts'), ['2'])

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

if __name__ == '__main__':
    unittest.main()
