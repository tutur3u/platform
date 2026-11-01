BEGIN;-- Deadline notices for teacher-assigned topic announcements (inert; no sender
-- is wired yet). The VN teacher in charge (GVCN) gets at most one reminder
-- before a session's 24-hour send deadline (send_due_at) and one notice after
-- it passes unsent, in-app and by email.
--
-- 1. Two notification types, 'topic_due_soon' and 'topic_late'. The current
--    list is read from the catalog and extended (as 20261026193000 does), so
--    this composes with any other migration that redefines
--    notifications_type_check before or after it.
-- 2. Their email goes out directly (sendWorkspaceEmail, with the email audit)
--    to the teacher's confirmed account email. should_send_notification
--    therefore answers false for their email channel, so create_notification
--    records the in-app notification without also queueing a digest email:
--    no double send. Every other type and channel is unchanged.
-- 3. private.topic_announcement_teacher_notices, one receipt per
--    (announcement, kind, send_due_at). The sender claims it with
--    insert ... on conflict do nothing BEFORE notifying, so a rerun, restart
--    or overlapping run never notifies twice. public.notifications has no
--    unique key and recipients may delete their rows, so it cannot be the
--    ledger. A new send_due_at (date or time changed) is a new key, which
--    re-arms both notices.
--
-- The replaced check constraint is added NOT VALID (a superset of the old
-- list, so existing rows already pass) and no table scan runs under ACCESS
-- EXCLUSIVE. The receipt table is service-role only.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  current_comment text;
  current_types text[];
  missing_types text[];
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
    into missing_types
  from unnest(array['topic_due_soon', 'topic_late'])
    with ordinality as wanted(type_name, position)
  where not (type_name = any(current_types));

  if missing_types is null then
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
      from unnest(current_types || missing_types)
        with ordinality as types(type_name, position)
    )
  );

  execute format(
    'comment on constraint notifications_type_check on public.notifications is %L',
    coalesce(current_comment, 'Validates notification types.')
  );
end;
$$;

-- Same body as 20251111080749, the 20261024023000 grants and the
-- 20261024025000 pinned search path (pg_catalog, pg_temp; every name in the
-- body is schema-qualified), with one rule first: the deadline notice types never use the
-- notification email channel, because their sender emails directly.
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
  if p_channel = 'email'
    and p_event_type in ('topic_due_soon', 'topic_late') then
    return false;
  end if;

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

create table private.topic_announcement_teacher_notices (
  announcement_id uuid not null,
  ws_id uuid not null
    references public.workspaces(id) on update cascade on delete cascade,
  kind text not null,
  send_due_at timestamptz not null,
  recipient_user_id uuid not null
    references public.users(id) on update cascade on delete cascade,
  notification_id uuid
    references public.notifications(id) on update cascade on delete set null,
  email_audit_id uuid
    references public.email_audit(id) on update cascade on delete set null,
  attempts smallint not null default 0,
  claimed_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error text,
  constraint topic_announcement_teacher_notices_pkey
    primary key (announcement_id, kind, send_due_at),
  -- A receipt belongs to its announcement's workspace (same scope pattern as
  -- topic_announcement_delivery_attempts, via topic_announcements_delivery_scope_unique).
  constraint topic_announcement_teacher_notices_announcement_scope
    foreign key (announcement_id, ws_id)
    references private.topic_announcements(id, ws_id)
    on update cascade on delete cascade,
  constraint topic_announcement_teacher_notices_kind_check
    check (kind in ('due_soon', 'late')),
  constraint topic_announcement_teacher_notices_attempts_check
    check (attempts between 0 and 2),
  constraint topic_announcement_teacher_notices_last_error_length
    check (last_error is null or length(last_error) <= 2000)
);

create index topic_announcement_teacher_notices_ws_idx
  on private.topic_announcement_teacher_notices (ws_id, claimed_at);

create index topic_announcement_teacher_notices_undelivered_idx
  on private.topic_announcement_teacher_notices (claimed_at)
  where delivered_at is null;

create index topic_announcement_teacher_notices_recipient_idx
  on private.topic_announcement_teacher_notices (recipient_user_id);

create index topic_announcement_teacher_notices_notification_idx
  on private.topic_announcement_teacher_notices (notification_id)
  where notification_id is not null;

create index topic_announcement_teacher_notices_email_audit_idx
  on private.topic_announcement_teacher_notices (email_audit_id)
  where email_audit_id is not null;

comment on table private.topic_announcement_teacher_notices is
  'One GVCN deadline notice (due_soon, late) per announcement and send_due_at, claimed before notifying so a rerun never notifies twice.';

alter table private.topic_announcement_teacher_notices enable row level security;

revoke all on table private.topic_announcement_teacher_notices
  from public, anon, authenticated;
grant select, insert, update, delete
  on table private.topic_announcement_teacher_notices
  to service_role;

notify pgrst, 'reload schema'; COMMIT;
