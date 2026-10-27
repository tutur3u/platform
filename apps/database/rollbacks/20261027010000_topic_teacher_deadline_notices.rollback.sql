-- Rollback for 20261027010000_topic_teacher_deadline_notices.sql.
-- Drops the deadline notice receipts (their data is lost), restores
-- should_send_notification without the deadline-notice email rule, and
-- restores the notification type list without 'topic_due_soon' and
-- 'topic_late'. The restored constraint stays NOT VALID, so existing
-- notifications of those types are kept, new rows of them are rejected, and
-- no validation scan runs while ACCESS EXCLUSIVE is held on
-- public.notifications.
-- Not a migration: apply manually only with release-authority approval, after
-- the deadline notice sender is switched off (ENABLE_TOPIC_TEACHER_REMINDERS).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

drop table if exists private.topic_announcement_teacher_notices;

create or replace function public.should_send_notification(
  p_user_id uuid,
  p_event_type text,
  p_channel text,
  p_scope public.notification_scope default 'workspace',
  p_ws_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_preference boolean;
begin
  -- Check for workspace-specific preference first
  if p_scope = 'workspace' and p_ws_id is not null then
    select enabled
      into v_preference
    from public.notification_preferences
    where user_id = p_user_id
      and ws_id = p_ws_id
      and event_type = p_event_type
      and channel = p_channel
      and scope = 'workspace';
  end if;

  -- Fall back to user-level preference if no workspace preference
  if v_preference is null then
    select enabled
      into v_preference
    from public.notification_preferences
    where user_id = p_user_id
      and ws_id is null
      and event_type = p_event_type
      and channel = p_channel
      and scope in ('user', 'system');
  end if;

  -- Default to enabled if no preference found
  return coalesce(v_preference, true);
end;
$$;

revoke all on function public.should_send_notification(uuid, text, text, public.notification_scope, uuid)
  from public, anon, authenticated;
grant execute on function public.should_send_notification(uuid, text, text, public.notification_scope, uuid)
  to service_role;

do $$
declare
  current_comment text;
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
      from unnest(
        array_remove(array_remove(current_types, 'topic_due_soon'), 'topic_late')
      ) with ordinality as types(type_name, position)
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
