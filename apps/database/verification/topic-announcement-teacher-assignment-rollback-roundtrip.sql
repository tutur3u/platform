-- Rollback proof for 20261026193000_topic_announcement_teacher_assignment.sql.
-- Run ONLY against a disposable local stack:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/rollbacks/20261026193000_topic_announcement_teacher_assignment.rollback.sql
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f apps/database/verification/topic-announcement-teacher-assignment-rollback-roundtrip.sql
-- then re-apply the forward migration and re-run
-- supabase/tests/topic-announcement-teacher-assignment.sql.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, private, extensions;
select plan(11);

select hasnt_column('private', 'topic_announcements', 'teacher_workspace_user_id',
  'rollback drops teacher_workspace_user_id');
select hasnt_column('private', 'topic_announcements', 'course_book',
  'rollback drops course_book');
select hasnt_column('private', 'topic_announcements', 'video_url',
  'rollback drops video_url');
select hasnt_column('private', 'topic_announcements', 'send_due_at',
  'rollback drops send_due_at');
select col_not_null('private', 'topic_announcements', 'topic',
  'rollback restores topic not null');
select ok(
  (select not convalidated from pg_constraint
   where conrelid = 'private.topic_announcements'::regclass
     and conname = 'topic_announcements_topic_not_blank')
  and not exists (select 1 from pg_constraint
    where conrelid = 'private.topic_announcements'::regclass
      and conname = 'topic_announcements_topic_ready_check'),
  'rollback restores the non-blank topic rule as NOT VALID'
);
select ok(
  to_regprocedure('private.topic_announcements_teacher_same_workspace()') is null,
  'rollback drops the teacher scope trigger function'
);
select ok(
  to_regclass('private.topic_announcements_teacher_session_idx') is null
  and to_regclass('private.topic_announcements_ws_send_due_idx') is null,
  'rollback drops both indexes'
);
select ok(
  pg_get_constraintdef((select oid from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_type_check')) not like '%''topic_assigned''%'
  and pg_get_constraintdef((select oid from pg_constraint
    where conrelid = 'public.notifications'::regclass
      and conname = 'notifications_type_check')) like '%''mail_received''%',
  'rollback removes only topic_assigned from the notification types'
);
select ok(
  (select not convalidated from pg_constraint
   where conrelid = 'public.notifications'::regclass
     and conname = 'notifications_type_check'),
  'rollback leaves the notification type constraint NOT VALID'
);

select throws_ok($$
  insert into public.notifications (ws_id, user_id, type, title)
  select ws_id, user_id, 'topic_assigned', 'Topic assigned'
  from public.workspace_members
  limit 1
$$, '23514', null, 'topic_assigned notifications are rejected after rollback');

select * from finish();
rollback;
