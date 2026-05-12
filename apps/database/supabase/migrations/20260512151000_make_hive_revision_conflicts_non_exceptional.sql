set check_function_bodies = off;

create or replace function public.apply_hive_world_event(
  p_server_id uuid,
  p_actor_user_id uuid,
  p_expected_revision bigint,
  p_event_type text,
  p_payload jsonb,
  p_world_data jsonb
)
returns table (
  id uuid,
  server_id uuid,
  revision bigint,
  actor_user_id uuid,
  event_type text,
  payload jsonb,
  created_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_revision bigint;
  event_row public.hive_world_events%rowtype;
begin
  if not public.is_hive_member(p_actor_user_id) and not public.is_hive_platform_admin(p_actor_user_id) then
    raise exception 'hive_access_denied' using errcode = '42501';
  end if;

  perform 1
  from public.hive_servers hs
  where hs.id = p_server_id
    and hs.enabled = true;

  if not found then
    raise exception 'hive_server_not_found' using errcode = 'P0002';
  end if;

  insert into public.hive_world_states (server_id, revision, world_data, updated_by)
  values (p_server_id, 0, '{}'::jsonb, p_actor_user_id)
  on conflict on constraint hive_world_states_pkey do nothing;

  update public.hive_world_states hws
  set
    revision = hws.revision + 1,
    world_data = coalesce(p_world_data, hws.world_data),
    updated_by = p_actor_user_id,
    updated_at = now()
  where hws.server_id = p_server_id
    and hws.revision = p_expected_revision
  returning hws.revision into next_revision;

  if next_revision is null then
    return;
  end if;

  insert into public.hive_world_events (
    server_id,
    revision,
    actor_user_id,
    event_type,
    payload
  )
  values (
    p_server_id,
    next_revision,
    p_actor_user_id,
    p_event_type,
    coalesce(p_payload, '{}'::jsonb)
  )
  returning * into event_row;

  return query
  select
    event_row.id,
    event_row.server_id,
    event_row.revision,
    event_row.actor_user_id,
    event_row.event_type,
    event_row.payload,
    event_row.created_at;
end;
$$;
