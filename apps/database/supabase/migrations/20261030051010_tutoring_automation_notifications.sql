-- Tutoring automation notifications (inert; nothing sends them yet).
--
-- 1. Two notification types, appended to the current notifications_type_check
--    list read from the catalog, so this composes with any other migration
--    that redefines the constraint before or after it (e.g. 20261029050200).
-- 2. Two receipt kinds on private.tutoring_notification_receipts: one absence
--    reminder per follow-up and recipient, one lesson report per workspace,
--    local date and recipient. Receipts are claimed before notifying, so a
--    rerun never notifies twice.
--
-- Depends on 20261030051000_tutoring_automation_foundation.sql. No grants
-- change: the receipts table stays service-role only.
BEGIN;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- 1. Notification types ----------------------------------------------------------

-- tuturuuu: reviewed(dynamic-sql-review): the only interpolated values are two fixed literals plus type names read from this constraint's own catalog definition, each passed through quote_literal.
do $$
declare
  current_comment text;
  current_types text[];
  added_types text[] := array[
    'tutoring_absence_makeup_reminder',
    'tutoring_lesson_incomplete_report'
  ];
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

  select array_agg(type_name order by position)
    into added_types
  from unnest(added_types) with ordinality as types(type_name, position)
  where not type_name = any(current_types);

  if added_types is null then
    return;
  end if;

  select obj_description(constraint_row.oid, 'pg_constraint')
    into current_comment
  from pg_constraint constraint_row
  where constraint_row.conrelid = 'public.notifications'::regclass
    and constraint_row.conname = 'notifications_type_check';

  alter table public.notifications
    drop constraint notifications_type_check;

  -- NOT VALID: the list is a strict superset, so existing rows already pass,
  -- and no validation scan runs while ACCESS EXCLUSIVE is held.
  execute format(
    'alter table public.notifications add constraint notifications_type_check check (type in (%s)) not valid',
    (
      select string_agg(quote_literal(type_name), ', ' order by position)
      from unnest(current_types || added_types) with ordinality as types(type_name, position)
    )
  );

  execute format(
    'comment on constraint notifications_type_check on public.notifications is %L',
    coalesce(current_comment, 'Validates notification types.')
  );
end;
$$;

-- 2. Receipt kinds ---------------------------------------------------------------

alter table private.tutoring_notification_receipts
  add column ws_id uuid references public.workspaces(id) on delete cascade,
  add column absence_followup_id uuid
    references private.tutoring_absence_followups(id) on delete cascade,
  add column report_date date;

alter table private.tutoring_notification_receipts
  drop constraint tutoring_notification_receipts_kind_check;

-- No caller writes receipts yet, so validating the replacement scans no rows.
alter table private.tutoring_notification_receipts
  add constraint tutoring_notification_receipts_kind_check check (
    (
      kind = 'weak_content_review_due'
      and group_id is not null
      and student_user_id is not null
      and review_cycle_started_at is not null
      and tutoring_session_id is null
      and absence_followup_id is null
      and report_date is null
    )
    or (
      kind = 'session_completed'
      and tutoring_session_id is not null
      and group_id is null
      and student_user_id is null
      and review_cycle_started_at is null
      and absence_followup_id is null
      and report_date is null
    )
    or (
      kind = 'absence_reminder'
      and ws_id is not null
      and absence_followup_id is not null
      and group_id is null
      and student_user_id is null
      and review_cycle_started_at is null
      and tutoring_session_id is null
      and report_date is null
    )
    or (
      kind = 'lesson_report'
      and ws_id is not null
      and report_date is not null
      and group_id is null
      and student_user_id is null
      and review_cycle_started_at is null
      and tutoring_session_id is null
      and absence_followup_id is null
    )
  );

-- As with the existing keys, null columns of other kinds never collide.
alter table private.tutoring_notification_receipts
  add constraint tutoring_notification_receipts_absence_key unique (
    absence_followup_id, recipient_user_id
  ),
  add constraint tutoring_notification_receipts_report_key unique (
    ws_id, report_date, recipient_user_id
  );

notify pgrst, 'reload schema';

COMMIT;
