-- Keep workspace calendar helper functions aligned with the private table move.
--
-- The workspace insert trigger runs during local seed data loading, after all
-- migrations have moved workspace_calendars out of public. Qualifying the
-- private table keeps reset/seed paths and server-owned RPCs on the same
-- schema boundary as the apps/web calendar APIs.

create or replace function public.create_workspace_system_calendars()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into private.workspace_calendars (
    ws_id,
    name,
    description,
    color,
    calendar_type,
    is_system,
    position
  )
  values
    (
      new.id,
      'Primary',
      'Default calendar for events',
      'BLUE',
      'primary',
      true,
      0
    ),
    (
      new.id,
      'Tasks',
      'Smart scheduled tasks',
      'PURPLE',
      'tasks',
      true,
      1
    ),
    (
      new.id,
      'Habits',
      'Habit instances',
      'GREEN',
      'habits',
      true,
      2
    );

  return new;
end;
$$;

create or replace function public.get_or_create_external_calendar(
  p_ws_id uuid,
  p_calendar_id text,
  p_calendar_name text,
  p_color text,
  p_provider public.calendar_provider
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_calendar_id uuid;
  v_caller_id uuid;
begin
  v_caller_id := auth.uid();

  if v_caller_id is null then
    raise exception 'Unauthorized: No authenticated user';
  end if;

  if not public.is_org_member(v_caller_id, p_ws_id) then
    raise exception 'Forbidden: User is not a member of this workspace';
  end if;

  select wc.id into v_calendar_id
  from private.workspace_calendars wc
  join public.calendar_connections cc
    on cc.workspace_calendar_id = wc.id
  where cc.ws_id = p_ws_id
    and cc.calendar_id = p_calendar_id
    and cc.provider = p_provider::text
  limit 1;

  if v_calendar_id is null then
    insert into private.workspace_calendars (
      ws_id,
      name,
      color,
      calendar_type,
      is_system,
      position
    )
    values (
      p_ws_id,
      p_calendar_name,
      coalesce(p_color, 'BLUE'),
      'custom',
      false,
      100
    )
    returning id into v_calendar_id;

    insert into public.calendar_connections (
      ws_id,
      workspace_calendar_id,
      calendar_id,
      provider,
      is_enabled,
      created_at
    )
    values (
      p_ws_id,
      v_calendar_id,
      p_calendar_id,
      p_provider::text,
      true,
      now()
    );
  end if;

  return v_calendar_id;
end;
$$;

revoke execute on function public.get_or_create_external_calendar(
  uuid,
  text,
  text,
  text,
  public.calendar_provider
) from public, anon;
grant execute on function public.get_or_create_external_calendar(
  uuid,
  text,
  text,
  text,
  public.calendar_provider
) to authenticated, service_role;

create or replace function public.get_default_calendar_for_event(
  p_ws_id uuid,
  p_scheduling_source public.calendar_scheduling_source default 'manual'
)
returns uuid
language plpgsql
security definer
stable
set search_path = public, private, pg_temp
as $$
declare
  v_calendar_id uuid;
  v_calendar_type public.workspace_calendar_type;
begin
  v_calendar_type := case p_scheduling_source
    when 'task' then 'tasks'::public.workspace_calendar_type
    when 'habit' then 'habits'::public.workspace_calendar_type
    else 'primary'::public.workspace_calendar_type
  end;

  select id into v_calendar_id
  from private.workspace_calendars
  where ws_id = p_ws_id
    and calendar_type = v_calendar_type
  limit 1;

  if v_calendar_id is null then
    select id into v_calendar_id
    from private.workspace_calendars
    where ws_id = p_ws_id
      and calendar_type = 'primary'
    limit 1;
  end if;

  return v_calendar_id;
end;
$$;

revoke execute on function public.get_default_calendar_for_event(
  uuid,
  public.calendar_scheduling_source
) from public, anon, authenticated;
grant execute on function public.get_default_calendar_for_event(
  uuid,
  public.calendar_scheduling_source
) to service_role;

notify pgrst, 'reload schema';
