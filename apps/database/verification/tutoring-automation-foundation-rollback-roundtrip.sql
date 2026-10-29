-- Rollback proof for 20261029192000 and 20261029192010 (tutoring automation).
-- Run ONLY against a disposable local stack, after creating a notification of
-- each new type so the kept-row case is exercised:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/rollbacks/20261029192010_tutoring_automation_notifications.rollback.sql
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/rollbacks/20261029192000_tutoring_automation_foundation.rollback.sql
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/verification/tutoring-automation-foundation-rollback-roundtrip.sql
-- then re-apply both forward migrations and re-run
-- supabase/tests/tutoring-automation-foundation.sql.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions;
select plan(8);

select hasnt_table('private', 'tutoring_automation_settings',
  'rollback drops the settings');
select hasnt_table('private', 'tutoring_absence_followups',
  'rollback drops the follow-ups');
select hasnt_table('private', 'tutoring_automation_events',
  'rollback drops the audit');
select is(
  (select count(*)::integer from pg_proc
   where pronamespace = 'private'::regnamespace
     and proname in (
       'tutoring_absence_followup_apply',
       'tutoring_automation_settings_stamp',
       'tutoring_automation_settings_audit',
       'tutoring_absence_followups_guard',
       'tutoring_automation_events_append_only'
     )),
  0,
  'rollback drops every new function'
);
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'private'
     and table_name = 'tutoring_notification_receipts'
     and column_name in ('ws_id', 'absence_followup_id', 'report_date')),
  0,
  'rollback drops the receipt columns'
);
select ok(
  (select pg_get_constraintdef(oid) ~ 'tutoring_absence_makeup_reminder'
     and pg_get_constraintdef(oid) ~ 'tutoring_lesson_incomplete_report'
     and pg_get_constraintdef(oid) ~ 'topic_assigned'
   from pg_constraint
   where conrelid = 'public.notifications'::regclass
     and conname = 'notifications_type_check'),
  'rollback keeps both notification types and the earlier ones'
);

insert into auth.users(id) values ('00000000-0000-4000-8000-000000099001');
insert into public.users(id) values ('00000000-0000-4000-8000-000000099001')
on conflict do nothing;
insert into public.notifications(user_id, type, title, scope)
values
  ('00000000-0000-4000-8000-000000099001', 'tutoring_absence_makeup_reminder',
   'Synthetic reminder', 'user'),
  ('00000000-0000-4000-8000-000000099001', 'tutoring_lesson_incomplete_report',
   'Synthetic report', 'user');

select lives_ok(
  $q$update public.notifications set read_at = now()
     where type in (
       'tutoring_absence_makeup_reminder', 'tutoring_lesson_incomplete_report'
     )$q$,
  'notifications of the kept types can still be marked read'
);
select ok(
  not exists (
    select 1 from public.notifications
    where type in (
      'tutoring_absence_makeup_reminder', 'tutoring_lesson_incomplete_report'
    )
      and read_at is null
  ),
  'mark-read reaches every kept notification, including ones created before the rollback'
);

select * from finish();
rollback;
