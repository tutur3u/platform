-- Rollback for 20261029192000_tutoring_automation_foundation.sql.
-- Drops the automation settings, absence follow-ups, and their audit (their
-- data is lost), removes the absence-reminder and lesson-report receipt kinds
-- with any such receipts, and removes the two notification types. The restored
-- type constraint stays NOT VALID, so existing notifications of those types
-- are kept, new rows of them are rejected, and no validation scan runs while
-- ACCESS EXCLUSIVE is held on public.notifications. Grants nothing.
-- Not a migration: apply manually only with release-authority approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

delete from private.tutoring_notification_receipts
where kind in ('absence_reminder', 'lesson_report');

alter table private.tutoring_notification_receipts
  drop constraint if exists tutoring_notification_receipts_absence_key,
  drop constraint if exists tutoring_notification_receipts_report_key,
  drop constraint if exists tutoring_notification_receipts_kind_check;

alter table private.tutoring_notification_receipts
  drop column if exists absence_followup_id,
  drop column if exists report_date,
  drop column if exists ws_id;

alter table private.tutoring_notification_receipts
  add constraint tutoring_notification_receipts_kind_check check (
    (
      kind = 'weak_content_review_due'
      and group_id is not null
      and student_user_id is not null
      and review_cycle_started_at is not null
      and tutoring_session_id is null
    )
    or (
      kind = 'session_completed'
      and tutoring_session_id is not null
      and group_id is null
      and student_user_id is null
      and review_cycle_started_at is null
    )
  );

drop function if exists private.tutoring_absence_followup_apply(
  uuid, uuid, uuid, date, text, uuid, text, uuid
);
drop table if exists private.tutoring_automation_events;
drop table if exists private.tutoring_absence_followups;
drop table if exists private.tutoring_automation_settings;
drop function if exists private.tutoring_automation_events_append_only();
drop function if exists private.tutoring_absence_followups_guard();
drop function if exists private.tutoring_automation_settings_track();

do $$
declare
  current_comment text;
  current_types text[];
  remaining_types text[];
begin
  select array_agg(match[1] order by ordinality)
    into current_types
  from pg_constraint constraint_row
  cross join lateral regexp_matches(
    pg_get_constraintdef(constraint_row.oid),
    '''([a-z0-9_]+)''',
    'g'
  ) with ordinality as matches(match, ordinality)
  where constraint_row.conrelid = 'public.notifications'::regclass
    and constraint_row.conname = 'notifications_type_check';

  if current_types is null or cardinality(current_types) = 0 then
    raise exception 'notifications_type_check is missing or has no types';
  end if;

  remaining_types := array_remove(
    array_remove(current_types, 'tutoring_absence_makeup_reminder'),
    'tutoring_lesson_incomplete_report'
  );
  if cardinality(remaining_types) = cardinality(current_types) then
    return;
  end if;

  select obj_description(constraint_row.oid, 'pg_constraint')
    into current_comment
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.notifications'::regclass
    and constraint_row.conname = 'notifications_type_check';

  alter table public.notifications
    drop constraint notifications_type_check;

  execute format(
    'alter table public.notifications add constraint notifications_type_check check (type in (%s)) not valid',
    (
      select string_agg(quote_literal(type_name), ', ' order by position)
      from unnest(remaining_types) with ordinality as types(type_name, position)
    )
  );

  execute format(
    'comment on constraint notifications_type_check on public.notifications is %L',
    coalesce(current_comment, 'Validates notification types.')
  );
end;
$$;

notify pgrst, 'reload schema';

commit;
