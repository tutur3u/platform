-- Move server-owned notification batch queues out of the exposed public schema.
--
-- These tables are operational delivery internals. Browser, mobile, and
-- satellite app consumers should use the centralized apps/web notification APIs
-- instead of direct Supabase Data API access.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

alter table if exists public.notification_delivery_log
  set schema private;

alter table if exists public.notification_batches
  set schema private;

revoke all on table private.notification_batches
  from public, anon, authenticated;

revoke all on table private.notification_delivery_log
  from public, anon, authenticated;

grant all on table private.notification_batches to service_role;
grant all on table private.notification_delivery_log to service_role;

alter table private.notification_batches enable row level security;
alter table private.notification_delivery_log enable row level security;

drop policy if exists "Users can view their own notification batches"
  on private.notification_batches;

drop policy if exists "System can manage notification batches"
  on private.notification_batches;

drop policy if exists "Service role can manage private notification batches"
  on private.notification_batches;

drop policy if exists "Users can view their own delivery logs"
  on private.notification_delivery_log;

drop policy if exists "System can insert delivery logs"
  on private.notification_delivery_log;

drop policy if exists "System can update delivery logs"
  on private.notification_delivery_log;

drop policy if exists "Service role can manage private notification delivery log"
  on private.notification_delivery_log;

create policy "Service role can manage private notification batches"
  on private.notification_batches
  for all
  to service_role
  using (true)
  with check (true);

create policy "Service role can manage private notification delivery log"
  on private.notification_delivery_log
  for all
  to service_role
  using (true)
  with check (true);

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'private'
      and tablename = 'notification_delivery_log'
  ) then
    alter publication supabase_realtime
      drop table private.notification_delivery_log;
  end if;

  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'private'
      and tablename = 'notification_batches'
  ) then
    alter publication supabase_realtime
      drop table private.notification_batches;
  end if;
end;
$$;

create or replace function public.get_or_create_notification_batch(
  p_ws_id uuid,
  p_user_id uuid,
  p_channel text,
  p_window_minutes integer default 10,
  p_email text default null,
  p_delivery_mode public.notification_delivery_mode default 'batched'
)
returns uuid
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_window_start timestamptz;
  v_window_end timestamptz;
begin
  if p_delivery_mode = 'immediate' then
    v_window_start := now();
    v_window_end := now();

    insert into private.notification_batches (
      ws_id,
      user_id,
      email,
      channel,
      window_start,
      window_end,
      delivery_mode
    ) values (
      p_ws_id,
      p_user_id,
      p_email,
      p_channel,
      v_window_start,
      v_window_end,
      'immediate'
    )
    returning id into v_batch_id;

    return v_batch_id;
  end if;

  if p_user_id is not null then
    select id into v_batch_id
    from private.notification_batches
    where (ws_id = p_ws_id or (ws_id is null and p_ws_id is null))
      and user_id = p_user_id
      and channel = p_channel
      and status = 'pending'
      and delivery_mode = 'batched'
      and window_end > now()
    order by window_start desc
    limit 1;
  elsif p_email is not null then
    select id into v_batch_id
    from private.notification_batches
    where (ws_id = p_ws_id or (ws_id is null and p_ws_id is null))
      and email = p_email
      and channel = p_channel
      and status = 'pending'
      and delivery_mode = 'batched'
      and window_end > now()
    order by window_start desc
    limit 1;
  end if;

  if v_batch_id is null then
    v_window_start := now();
    v_window_end := now() + (p_window_minutes || ' minutes')::interval;

    insert into private.notification_batches (
      ws_id,
      user_id,
      email,
      channel,
      window_start,
      window_end,
      delivery_mode
    ) values (
      p_ws_id,
      p_user_id,
      p_email,
      p_channel,
      v_window_start,
      v_window_end,
      'batched'
    )
    returning id into v_batch_id;
  end if;

  return v_batch_id;
end;
$$;

create or replace function public.create_notification(
  p_ws_id uuid default null,
  p_user_id uuid default null,
  p_email text default null,
  p_type text default null,
  p_code text default null,
  p_title text default null,
  p_description text default null,
  p_data jsonb default '{}'::jsonb,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_created_by uuid default null,
  p_scope public.notification_scope default 'workspace',
  p_priority public.notification_priority default 'medium'
)
returns uuid
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_notification_id uuid;
  v_should_send_web boolean := false;
  v_should_send_email boolean := false;
  v_should_send_push boolean := false;
  v_should_create_notification boolean := false;
  v_email_batch_id uuid;
  v_push_batch_id uuid;
  v_target_user_id uuid;
  v_target_email text;
  v_email_config record;
  v_notification_key text;
  v_email_delivery_mode public.notification_delivery_mode;
  v_push_delivery_mode public.notification_delivery_mode;
  v_email_batch_window integer;
  v_push_batch_window integer;
  v_final_priority public.notification_priority;
  v_is_workspace_member boolean := true;
begin
  if p_user_id is null and p_email is null then
    raise exception 'Either p_user_id or p_email must be provided';
  end if;

  if p_user_id is not null then
    v_target_user_id := p_user_id;
  else
    v_target_user_id := null;
  end if;

  if v_target_user_id is not null
     and p_ws_id is not null
     and p_scope = 'workspace'::public.notification_scope then
    select exists (
      select 1
      from public.workspace_members
      where ws_id = p_ws_id
        and user_id = v_target_user_id
    )
    into v_is_workspace_member;

    if not v_is_workspace_member then
      return null;
    end if;
  end if;

  v_notification_key := coalesce(p_type, p_code);

  select * into v_email_config
  from public.get_notification_email_config(v_notification_key);

  v_email_delivery_mode := coalesce(v_email_config.delivery_mode, 'batched');
  v_email_batch_window := coalesce(v_email_config.batch_window_minutes, 10);
  v_final_priority := coalesce(v_email_config.priority_override, p_priority);

  v_push_delivery_mode := case
    when v_notification_key in (
      'workspace_invite',
      'task_mention',
      'security_alert',
      'account_update'
    ) then 'immediate'::public.notification_delivery_mode
    else 'batched'::public.notification_delivery_mode
  end;

  v_push_batch_window := case
    when v_notification_key = 'task_mention' then 5
    else v_email_batch_window
  end;

  if v_target_user_id is not null then
    if p_email is null then
      select email into v_target_email
      from public.user_private_details
      where user_id = v_target_user_id;
    else
      v_target_email := p_email;
    end if;
  else
    v_target_email := p_email;
  end if;

  if v_target_user_id is not null then
    v_should_send_web := public.should_send_notification(
      v_target_user_id,
      v_notification_key,
      'web',
      p_scope,
      p_ws_id
    );

    v_should_send_email := v_target_email is not null and public.should_send_notification(
      v_target_user_id,
      v_notification_key,
      'email',
      p_scope,
      p_ws_id
    );

    v_should_send_push := public.should_send_notification(
      v_target_user_id,
      v_notification_key,
      'push',
      p_scope,
      p_ws_id
    );
  else
    v_should_send_web := true;
    v_should_send_email := true;
    v_should_send_push := false;
  end if;

  v_should_create_notification :=
    coalesce(v_should_send_web, false)
    or coalesce(v_should_send_email, false)
    or coalesce(v_should_send_push, false);

  if v_should_create_notification then
    insert into public.notifications (
      ws_id,
      user_id,
      email,
      type,
      code,
      title,
      description,
      data,
      entity_type,
      entity_id,
      created_by,
      scope,
      priority
    ) values (
      p_ws_id,
      v_target_user_id,
      v_target_email,
      p_type,
      p_code,
      p_title,
      p_description,
      p_data,
      p_entity_type,
      p_entity_id,
      p_created_by,
      p_scope,
      v_final_priority
    )
    returning id into v_notification_id;

    if v_should_send_email and v_target_email is not null then
      v_email_batch_id := public.get_or_create_notification_batch(
        p_ws_id,
        v_target_user_id,
        'email',
        v_email_batch_window,
        v_target_email,
        v_email_delivery_mode
      );

      insert into private.notification_delivery_log (
        notification_id,
        channel,
        status,
        batch_id
      ) values (
        v_notification_id,
        'email',
        'pending',
        v_email_batch_id
      );

      update private.notification_batches
      set notification_count = notification_count + 1
      where id = v_email_batch_id;
    end if;

    if v_should_send_push and v_target_user_id is not null then
      v_push_batch_id := public.get_or_create_notification_batch(
        p_ws_id,
        v_target_user_id,
        'push',
        v_push_batch_window,
        null,
        v_push_delivery_mode
      );

      insert into private.notification_delivery_log (
        notification_id,
        channel,
        status,
        batch_id
      ) values (
        v_notification_id,
        'push',
        'pending',
        v_push_batch_id
      );

      update private.notification_batches
      set notification_count = notification_count + 1
      where id = v_push_batch_id;
    end if;

    return v_notification_id;
  end if;

  return null;
end;
$$;

create or replace function public.process_notification_batches()
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  raise notice
    'public.process_notification_batches is deprecated; use /api/cron/process-notification-batches.';
end;
$$;

drop trigger if exists trigger_send_immediate_notification
  on private.notification_batches;

create trigger trigger_send_immediate_notification
  after insert on private.notification_batches
  for each row
  when (new.delivery_mode = 'immediate')
  execute function public.trigger_immediate_notification_send();

revoke execute on function public.create_notification(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  uuid,
  uuid,
  public.notification_scope,
  public.notification_priority
) from public, anon, authenticated;

revoke execute on function public.get_or_create_notification_batch(
  uuid,
  uuid,
  text,
  integer,
  text,
  public.notification_delivery_mode
) from public, anon, authenticated;

revoke execute on function public.process_notification_batches()
  from public, anon, authenticated;

revoke execute on function public.trigger_immediate_notification_send()
  from public, anon, authenticated;

grant execute on function public.create_notification(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  uuid,
  uuid,
  public.notification_scope,
  public.notification_priority
) to service_role;

grant execute on function public.get_or_create_notification_batch(
  uuid,
  uuid,
  text,
  integer,
  text,
  public.notification_delivery_mode
) to service_role;

grant execute on function public.process_notification_batches()
  to service_role;

grant execute on function public.trigger_immediate_notification_send()
  to service_role;

comment on table private.notification_batches is
  'Private notification delivery batches processed by apps/web cron and immediate-send routes.';

comment on table private.notification_delivery_log is
  'Private delivery attempts for notification email and push channels. Access through centralized apps/web APIs only.';

comment on function public.get_or_create_notification_batch(
  uuid,
  uuid,
  text,
  integer,
  text,
  public.notification_delivery_mode
) is
  'Service-role-only helper that creates or reuses private notification delivery batches.';

comment on function public.create_notification(
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  text,
  uuid,
  uuid,
  public.notification_scope,
  public.notification_priority
) is
  'Service-role-only notification creation helper that writes delivery queues to private notification internals.';
