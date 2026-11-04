"""Replay exact main migration files against disposable local PostgreSQL."""
import importlib.util
import pathlib
import unittest
r=pathlib.Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('fixture',r/'apps/database/verification/tutoring-content-rules-test.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Migrated(m.ContentRules):
    def setUp(self):
        self.sql('drop schema if exists auth cascade;')
        super().setUp()
        # Replace fixture notification/review tables with their real DDL.
        self.sql('drop table private.tutoring_notification_receipts cascade; drop table private.tutoring_weak_support_reviews cascade; drop table public.notifications cascade; create table public.workspaces(id uuid primary key); create table public.users(id uuid primary key); create table private.workspace_tutoring_sessions(id uuid primary key); create schema if not exists auth; create or replace function auth.uid() returns uuid language sql as $$select null::uuid$$;')
        self.sql('create table public.workspace_email_invites(id uuid); create table public.workspace_invites(id uuid); create table auth.users(id uuid,email text);')
        self.sql("insert into public.users values ('00000000-0000-0000-0000-000000000005'); insert into public.workspaces values ('00000000-0000-0000-0000-000000000001');")
        migrations=r/'apps/database/supabase/migrations'
        for name in ['20251108200001_create_notifications_table.sql','20251108200002_create_notification_preferences_table.sql','20251108200003_create_notification_delivery_log_table.sql','20251108200004_create_notification_batches_table.sql','20251108200005_create_notification_functions.sql','20251108200009_upgrade_notifications_system.sql','20251108200010_add_notification_codes_and_email_support.sql','20261026191000_tutoring_follow_up_notification_foundation.sql']:
            self.sql('begin;'+(migrations/name).read_text()+'commit;')
        self.sql('drop table private.tutoring_content_scan_cursor; drop table if exists private.tutoring_content_review_episodes; drop function private.process_tutoring_content_rules(integer);')
        self.pre_migration()
        self.apply_migration()
    def test_n1_receipt_dedup(self):
        self.sql("insert into private.workspace_tutoring_sessions values ('00000000-0000-0000-0000-000000000006'); insert into private.tutoring_notification_receipts(kind,tutoring_session_id,recipient_user_id) values ('session_completed','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000005')")
        self.sql('insert into private.tutoring_notification_receipts(kind,tutoring_session_id,recipient_user_id) select kind,tutoring_session_id,recipient_user_id from private.tutoring_notification_receipts on conflict do nothing')
        self.assertEqual(self.sql('select count(*) from private.tutoring_notification_receipts'), ['1'])
        self.assertEqual(self.sql('select stage from private.tutoring_notification_receipts'), ['n1'])

if __name__=='__main__' : unittest.main()
