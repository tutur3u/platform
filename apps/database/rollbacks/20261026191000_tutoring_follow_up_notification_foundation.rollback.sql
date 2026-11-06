-- Rollback for 20261026191000_tutoring_follow_up_notification_foundation.sql.
-- Drops the review clock, the receipts, and the tutor comment column (their
-- data is lost), and restores the previous notification type list. The
-- restored constraint stays NOT VALID, so existing tutoring notifications are
-- kept, new rows of the removed types are rejected, and no validation scan
-- runs while ACCESS EXCLUSIVE is held on public.notifications.
-- Not a migration: apply manually only with release-authority approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop table if exists private.tutoring_notification_receipts;
drop table if exists private.tutoring_weak_support_reviews;

alter table private.workspace_tutoring_sessions
  drop column if exists tutor_comment;

do $$
declare
  current_types text[];
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

  alter table public.notifications
    drop constraint notifications_type_check;

  execute format(
    'alter table public.notifications add constraint notifications_type_check check (type in (%s)) not valid',
    (
      select string_agg(quote_literal(type_name), ', ' order by position)
      from unnest(array_remove(array_remove(current_types, 'tutoring_weak_content_review_due'), 'tutoring_session_completed')) with ordinality as types(type_name, position)
    )
  );
end;
$$;

comment on constraint notifications_type_check on public.notifications is
  'Validates notification types for task activity, workspace/system notices, approvals, time tracking request workflows, chat messages, and incoming Mail.';

notify pgrst, 'reload schema';

commit;
