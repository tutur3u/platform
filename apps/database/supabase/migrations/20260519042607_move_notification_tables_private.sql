-- Move server-owned notification internals out of the exposed public schema.
--
-- Public remains the default Supabase Data API schema, so tables that should
-- only be reached through centralized API routes belong in private. Routes call
-- the service-role-only RPCs below instead of querying these tables directly.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.notification_email_config
  set schema private;

alter table if exists public.task_reminder_sent
  set schema private;

revoke all on table private.notification_email_config
  from public, anon, authenticated;

revoke all on table private.task_reminder_sent
  from public, anon, authenticated;

grant all on table private.notification_email_config to service_role;
grant all on table private.task_reminder_sent to service_role;

drop policy if exists "Service role can manage email config"
  on private.notification_email_config;

drop policy if exists "Users can view their own reminder history"
  on private.task_reminder_sent;

drop policy if exists "Service role can manage reminders"
  on private.task_reminder_sent;

alter table private.notification_email_config enable row level security;
alter table private.task_reminder_sent enable row level security;

create policy "Service role can manage email config"
  on private.notification_email_config
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage task reminder tracking"
  on private.task_reminder_sent
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.get_notification_email_config(
  p_notification_type text
)
returns table (
  delivery_mode public.notification_delivery_mode,
  email_template text,
  email_subject_template text,
  priority_override public.notification_priority,
  batch_window_minutes integer,
  enabled boolean
)
language plpgsql
security definer
set search_path = private, public
as $$
begin
  return query
  select
    nec.delivery_mode,
    nec.email_template,
    nec.email_subject_template,
    nec.priority_override,
    nec.batch_window_minutes,
    nec.enabled
  from private.notification_email_config nec
  where nec.notification_type = p_notification_type
    and nec.enabled = true;

  if not found then
    return query
    select
      'batched'::public.notification_delivery_mode,
      null::text,
      null::text,
      null::public.notification_priority,
      10::integer,
      true::boolean;
  end if;
end;
$$;

create or replace function public.list_immediate_notification_email_configs(
  p_notification_types text[]
)
returns table (
  notification_type text,
  email_template text,
  email_subject_template text
)
language sql
security definer
set search_path = private, public
as $$
  select
    nec.notification_type,
    nec.email_template,
    nec.email_subject_template
  from private.notification_email_config nec
  where nec.notification_type = any(
      coalesce(p_notification_types, array[]::text[])
    )
    and nec.delivery_mode = 'immediate'::public.notification_delivery_mode
    and nec.enabled = true
  order by nec.notification_type;
$$;

create or replace function public.task_reminder_already_sent(
  p_task_id uuid,
  p_user_id uuid,
  p_reminder_interval text
)
returns boolean
language sql
security definer
set search_path = private, public
as $$
  select exists (
    select 1
    from private.task_reminder_sent sent
    where sent.task_id = p_task_id
      and sent.user_id = p_user_id
      and sent.reminder_interval = p_reminder_interval
  );
$$;

create or replace function public.record_task_reminder_sent(
  p_task_id uuid,
  p_user_id uuid,
  p_reminder_interval text,
  p_notification_id uuid
)
returns uuid
language sql
security definer
set search_path = private, public
as $$
  insert into private.task_reminder_sent as sent (
    task_id,
    user_id,
    reminder_interval,
    notification_id
  )
  values (
    p_task_id,
    p_user_id,
    p_reminder_interval,
    p_notification_id
  )
  on conflict (task_id, user_id, reminder_interval)
  do update
    set notification_id = coalesce(excluded.notification_id, sent.notification_id)
  returning sent.id;
$$;

revoke execute on function public.get_notification_email_config(text)
  from public, anon, authenticated;

revoke execute on function public.list_immediate_notification_email_configs(text[])
  from public, anon, authenticated;

revoke execute on function public.task_reminder_already_sent(uuid, uuid, text)
  from public, anon, authenticated;

revoke execute on function public.record_task_reminder_sent(uuid, uuid, text, uuid)
  from public, anon, authenticated;

revoke execute on function public.update_notification_email_config_updated_at()
  from public, anon, authenticated;

grant execute on function public.get_notification_email_config(text)
  to service_role;

grant execute on function public.list_immediate_notification_email_configs(text[])
  to service_role;

grant execute on function public.task_reminder_already_sent(uuid, uuid, text)
  to service_role;

grant execute on function public.record_task_reminder_sent(uuid, uuid, text, uuid)
  to service_role;

comment on table private.notification_email_config is
  'Private configuration for notification email delivery. Access through service-role API routes or restricted RPCs only.';

comment on table private.task_reminder_sent is
  'Private reminder tracking used by cron jobs to prevent duplicate deadline notifications.';

comment on function public.list_immediate_notification_email_configs(text[]) is
  'Service-role-only RPC that returns immediate email delivery configs without exposing the backing private table.';

comment on function public.task_reminder_already_sent(uuid, uuid, text) is
  'Service-role-only RPC that checks private task reminder tracking.';

comment on function public.record_task_reminder_sent(uuid, uuid, text, uuid) is
  'Service-role-only RPC that records private task reminder tracking.';
