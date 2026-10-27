-- Rollback proof for 20261027095000_topic_teacher_deadline_notices.sql.
-- Run ONLY against a disposable local stack:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/rollbacks/20261027095000_topic_teacher_deadline_notices.rollback.sql
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/verification/topic-teacher-deadline-notices-rollback-roundtrip.sql
-- then re-apply the forward migration and re-run
-- supabase/tests/topic-teacher-deadline-notices.sql.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions;
select plan(7);

select hasnt_table('private', 'topic_announcement_teacher_notices',
  'rollback drops the deadline notice receipts');
select ok(
  pg_get_constraintdef(
    (select oid from pg_constraint
      where conrelid = 'public.notifications'::regclass
        and conname = 'notifications_type_check')
  ) !~ 'topic_(due_soon|late)',
  'rollback removes the deadline types'
);
select ok(
  pg_get_constraintdef(
    (select oid from pg_constraint
      where conrelid = 'public.notifications'::regclass
        and conname = 'notifications_type_check')
  ) ~ 'topic_assigned',
  'rollback keeps the earlier types'
);
select ok(
  not (select convalidated from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_type_check'),
  'restored type check stays NOT VALID'
);
select is(
  public.should_send_notification(
    gen_random_uuid(), 'topic_late', 'email', 'workspace', gen_random_uuid()),
  true, 'rollback removes the deadline email rule');
select ok(
  (select prosecdef and proconfig @> array['search_path=""']
    from pg_proc
    where oid = 'public.should_send_notification(uuid, text, text, public.notification_scope, uuid)'::regprocedure),
  'should_send_notification keeps security definer and an empty search_path'
);
select ok(
  not has_function_privilege('authenticated',
    'public.should_send_notification(uuid, text, text, public.notification_scope, uuid)', 'execute'),
  'should_send_notification stays service-role only'
);

select * from finish();
rollback;
