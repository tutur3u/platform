-- Inert preparation only. No client, accounting or deadline worker consumes this.
-- Active Pomodoro requires normalization of every existing lifecycle writer.
create function private.valid_time_tracker_control_config(p_config jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object'
    or not p_config ?& array['focus_minutes','short_break_minutes','long_break_minutes',
      'sessions_until_long_break','auto_start_breaks','auto_start_focus']
    or p_config - array['focus_minutes','short_break_minutes','long_break_minutes',
      'sessions_until_long_break','auto_start_breaks','auto_start_focus'] <> '{}'::jsonb
    or jsonb_typeof(p_config->'auto_start_breaks') <> 'boolean'
    or jsonb_typeof(p_config->'auto_start_focus') <> 'boolean' then
    return false;
  end if;
  for i in 1..4 loop
    declare
      v_key text := (array['focus_minutes','short_break_minutes','long_break_minutes',
        'sessions_until_long_break'])[i];
    begin
      if jsonb_typeof(p_config->v_key) <> 'number'
        or (p_config->>v_key) !~ '^[1-9][0-9]{0,2}$' then return false; end if;
      if (p_config->>v_key)::integer > case when i=4 then 24 else 180 end
        then return false; end if;
    end;
  end loop;
  return true;
end;
$$;

create table private.time_tracker_controls (
  ws_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid not null references public.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  mode text not null default 'off' check (mode = 'off'),
  phase text not null default 'idle' check (phase = 'idle'),
  deadline_at timestamptz check (deadline_at is null),
  -- Deliberately no FK/trigger on sessions: this inert foundation must not
  -- block or change existing tracker/approval deletion and accounting paths.
  prepared_session_id uuid,
  config jsonb not null check (private.valid_time_tracker_control_config(config)),
  last_command_id uuid not null,
  last_command_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ws_id, actor_id)
);
alter table private.time_tracker_controls enable row level security;
revoke all on private.time_tracker_controls from public, anon, authenticated, service_role;
grant select on private.time_tracker_controls to service_role;

create function private.read_time_tracker_control(p_ws_id uuid, p_actor_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not exists (select 1 from public.workspace_members m
    where m.ws_id=p_ws_id and m.user_id=p_actor_id and m.type='MEMBER') then
    raise exception 'Insufficient permissions' using errcode='42501';
  end if;
  select to_jsonb(c) - 'last_command_payload' - 'last_command_id'
    into v_result from private.time_tracker_controls c
    where c.ws_id=p_ws_id and c.actor_id=p_actor_id;
  return v_result;
end;
$$;

-- expected revision zero initializes; positive revisions update only config
-- and the inert prepared-session reference. A replay of the latest command
-- returns its same result; reusing that command with different input is denied.
create function private.configure_time_tracker_control(
  p_ws_id uuid, p_actor_id uuid, p_expected_revision bigint,
  p_command_id uuid, p_config jsonb, p_prepared_session_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_control private.time_tracker_controls%rowtype;
  v_payload jsonb;
begin
  if not exists (select 1 from public.workspace_members m
    where m.ws_id=p_ws_id and m.user_id=p_actor_id and m.type='MEMBER') then
    raise exception 'Insufficient permissions' using errcode='42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_command_id is null
    or not private.valid_time_tracker_control_config(p_config) then
    raise exception 'Invalid control configuration' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    concat_ws(':','time-tracker-control',p_ws_id,p_actor_id),0));
  select * into v_control from private.time_tracker_controls
    where ws_id=p_ws_id and actor_id=p_actor_id for update;
  v_payload := jsonb_build_object('expected_revision',p_expected_revision,
    'config',p_config,'prepared_session_id',p_prepared_session_id);
  if found and v_control.last_command_id=p_command_id then
    if v_control.last_command_payload <> v_payload then
      raise exception 'Control command conflict' using errcode='40001';
    end if;
    return to_jsonb(v_control) - 'last_command_payload' - 'last_command_id';
  end if;
  if (v_control.actor_id is null and p_expected_revision <> 0)
    or (v_control.actor_id is not null and v_control.revision <> p_expected_revision) then
    raise exception 'Control revision conflict' using errcode='40001';
  end if;
  if p_prepared_session_id is not null then
    perform 1 from public.time_tracking_sessions
      where id=p_prepared_session_id and ws_id=p_ws_id and user_id=p_actor_id
      for share;
    if not found then
      raise exception 'Prepared session unavailable' using errcode='22023';
    end if;
  end if;
  if v_control.actor_id is null then
    insert into private.time_tracker_controls(ws_id,actor_id,config,
      prepared_session_id,last_command_id,last_command_payload)
      values(p_ws_id,p_actor_id,p_config,p_prepared_session_id,p_command_id,v_payload)
      returning * into v_control;
  else
    update private.time_tracker_controls set config=p_config,
      prepared_session_id=p_prepared_session_id, revision=revision+1,
      last_command_id=p_command_id,last_command_payload=v_payload,updated_at=now()
      where ws_id=p_ws_id and actor_id=p_actor_id returning * into v_control;
  end if;
  return to_jsonb(v_control) - 'last_command_payload' - 'last_command_id';
end;
$$;

revoke all on function private.valid_time_tracker_control_config(jsonb) from public, anon, authenticated;
revoke all on function private.read_time_tracker_control(uuid,uuid) from public, anon, authenticated;
revoke all on function private.configure_time_tracker_control(uuid,uuid,bigint,uuid,jsonb,uuid) from public, anon, authenticated;
grant execute on function private.valid_time_tracker_control_config(jsonb) to service_role;
grant execute on function private.read_time_tracker_control(uuid,uuid) to service_role;
grant execute on function private.configure_time_tracker_control(uuid,uuid,bigint,uuid,jsonb,uuid) to service_role;
comment on table private.time_tracker_controls is
  'INERT off-only preparation. Not consumed by tracker clients. Writer normalization and atomic accounting remain prerequisites.';
