-- People registry authority: one-time workspace bootstrap, the registry owner,
-- named managers, channel bindings and shared audit/outbox helpers. Callers pass
-- the actor from a verified session; every function rechecks it live.
begin;
set local lock_timeout = '3s';

-- Platform lookups the registry definer role cannot make itself, because
-- public.workspaces is under client RLS and auth.users belongs to Auth.
-- tuturuuu: reviewed(function-grant) registry definer only
create function private.people_workspace_creator(p_ws uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select w.creator_id from public.workspaces w where w.id = p_ws and not coalesce(w.personal, false);
$$;
revoke all on function private.people_workspace_creator(uuid) from public, anon, authenticated, service_role;
grant execute on function private.people_workspace_creator(uuid) to people_registry_definer;

-- tuturuuu: reviewed(function-grant) registry definer only
create function private.people_user_exists(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (select 1 from auth.users u where u.id = p_user);
$$;
revoke all on function private.people_user_exists(uuid) from public, anon, authenticated, service_role;
grant execute on function private.people_user_exists(uuid) to people_registry_definer;

-- tuturuuu: no-grant (internal)
create function private.people_audit(
  p_ws uuid, p_actor uuid, p_principal uuid, p_action text, p_reason text,
  p_purpose text default 'manage', p_conversation uuid default null, p_records uuid[] default '{}'
)
returns void
language sql
set search_path = pg_catalog, pg_temp
as $$
  insert into private.people_audit_events
    (ws_id, actor_user_id, principal_id, action, reason_code, purpose, conversation_id, record_ids)
  values (p_ws, p_actor, p_principal, p_action, p_reason, p_purpose, p_conversation, p_records);
$$;

-- tuturuuu: no-grant (internal)
create function private.people_emit_change(
  p_ws uuid, p_person uuid, p_conversation uuid, p_kind private.people_change_kind
)
returns void
language sql
set search_path = pg_catalog, pg_temp
as $$
  insert into private.people_change_events (ws_id, person_id, conversation_id, version, consent_version, kind)
  select p_ws, p.id, null, p.version, p.consent_version, p_kind
  from private.people_persons p where p_person is not null and p.ws_id = p_ws and p.id = p_person
  union all
  select p_ws, null, c.id, c.version, c.consent_version, p_kind
  from private.people_conversations c
  where p_conversation is not null and c.ws_id = p_ws and c.id = p_conversation;
$$;

-- The root registry follows the live Fleet owner, so a Fleet ownership transfer
-- carries over and the former owner loses access. Tenants use the stored owner.
-- tuturuuu: no-grant (internal)
create function private.people_is_registry_owner(p_ws uuid, p_actor uuid, p_owner uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select case when p_ws = '00000000-0000-0000-0000-000000000000'::uuid
    then coalesce(private.fleet_is_owner(p_actor), false)
    else p_owner is not null and p_owner = p_actor end;
$$;

-- Locks the workspace control row, which serialises generation changes.
-- tuturuuu: no-grant (internal)
create function private.people_require_actor(p_ws uuid, p_actor uuid, p_owner_only boolean)
returns private.people_registry_control
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_control private.people_registry_control;
begin
  select * into v_control from private.people_registry_control c where c.ws_id = p_ws for update;
  if not found or p_actor is null then
    raise exception 'People registry access required' using errcode = '42501';
  end if;

  if private.people_is_registry_owner(p_ws, p_actor, v_control.owner_user_id) then
    return v_control;
  end if;

  if not p_owner_only and exists (
    select 1 from private.people_registry_managers m
    where m.ws_id = p_ws and m.user_id = p_actor
      and (m.expires_at is null or m.expires_at > clock_timestamp())
  ) then
    return v_control;
  end if;

  raise exception 'People registry access required' using errcode = '42501';
end;
$$;

-- tuturuuu: reviewed(function-grant) service role; actor from a verified session with a fresh sign-in
create function private.people_registry_enable(p_ws uuid, p_actor uuid, p_wrapped_keys jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_purpose private.people_key_purpose;
  v_key bytea;
begin
  if p_actor is null or jsonb_typeof(p_wrapped_keys) is distinct from 'object' then
    raise exception 'Invalid registry bootstrap' using errcode = '22023';
  end if;
  if p_ws = '00000000-0000-0000-0000-000000000000'::uuid then
    if not private.fleet_is_owner(p_actor) then
      raise exception 'People registry access required' using errcode = '42501';
    end if;
  elsif private.people_workspace_creator(p_ws) is distinct from p_actor then
    raise exception 'People registry access required' using errcode = '42501';
  end if;

  insert into private.people_registry_control (ws_id, owner_user_id)
    values (p_ws, p_actor) on conflict (ws_id) do nothing;
  if not found then
    return jsonb_build_object('reason', 'already_enabled');
  end if;

  foreach v_purpose in array enum_range(null::private.people_key_purpose) loop
    v_key := decode(coalesce(p_wrapped_keys ->> v_purpose::text, ''), 'base64');
    if octet_length(v_key) not between 44 and 128 then
      raise exception 'Missing wrapped key for %', v_purpose using errcode = '22023';
    end if;
    insert into private.people_workspace_keys (ws_id, purpose, version, wrapped_key)
      values (p_ws, v_purpose, 1, v_key);
  end loop;

  perform private.people_audit(p_ws, p_actor, null, 'registry.enable', 'enabled');
  return jsonb_build_object('reason', 'enabled');
end;
$$;

-- tuturuuu: reviewed(function-grant) service role; actor from a verified session
create function private.people_registry_get_control(p_ws uuid, p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_control private.people_registry_control := private.people_require_actor(p_ws, p_actor, false);
begin
  return jsonb_build_object(
    'isOwner', private.people_is_registry_owner(p_ws, p_actor, v_control.owner_user_id),
    'captureEnabled', v_control.capture_enabled,
    'personalSessionsEnabled', v_control.personal_sessions_enabled,
    'stopped', v_control.stopped,
    'generation', v_control.generation,
    'keys', coalesce((
      select jsonb_agg(jsonb_build_object(
        'purpose', k.purpose, 'version', k.version, 'wrappedKey', encode(k.wrapped_key, 'base64'),
        'current', k.retired_at is null
      ) order by k.purpose, k.version)
      from private.people_workspace_keys k where k.ws_id = p_ws
    ), '[]'::jsonb)
  );
end;
$$;

-- tuturuuu: reviewed(function-grant) service role; registry owner only
create function private.people_registry_set_manager(
  p_ws uuid, p_actor uuid, p_user uuid, p_expires_at timestamptz, p_remove boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_control private.people_registry_control := private.people_require_actor(p_ws, p_actor, true);
begin
  if p_user is null or p_user = v_control.owner_user_id
    or (p_expires_at is not null and p_expires_at <= clock_timestamp()) then
    raise exception 'Invalid manager' using errcode = '22023';
  end if;
  if p_remove then
    delete from private.people_registry_managers m where m.ws_id = p_ws and m.user_id = p_user;
  else
    if not private.people_user_exists(p_user) then
      raise exception 'Invalid manager' using errcode = '22023';
    end if;
    insert into private.people_registry_managers (ws_id, user_id, added_by, expires_at)
      values (p_ws, p_user, p_actor, p_expires_at)
      on conflict (ws_id, user_id) do update set expires_at = excluded.expires_at, added_by = excluded.added_by;
  end if;
  update private.people_registry_control c set generation = c.generation + 1 where c.ws_id = p_ws;
  perform private.people_audit(p_ws, p_actor, null,
    case when p_remove then 'manager.remove' else 'manager.add' end, 'updated', 'manage', null, array[p_user]);
  return jsonb_build_object('reason', 'updated');
end;
$$;

-- tuturuuu: reviewed(function-grant) service role; registry owner only
create function private.people_registry_set_binding(
  p_ws uuid, p_actor uuid, p_channel private.people_channel, p_account text, p_remove boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_control private.people_registry_control := private.people_require_actor(p_ws, p_actor, true);
  v_existing uuid;
  v_changed boolean;
begin
  if p_channel not in ('zalo', 'whatsapp', 'discord') or coalesce(p_account, '') !~ '^[!-~]{1,200}$' then
    raise exception 'Invalid binding' using errcode = '22023';
  end if;
  if p_remove then
    delete from private.people_channel_bindings b
      where b.channel = p_channel and b.provider_account_id = p_account and b.ws_id = p_ws;
    v_changed := found;
  else
    -- The insert outcome decides the race: the loser reads the committed owner.
    insert into private.people_channel_bindings (channel, provider_account_id, ws_id, added_by)
      values (p_channel, p_account, p_ws, p_actor) on conflict do nothing;
    v_changed := found;
    if not v_changed then
      select b.ws_id into v_existing from private.people_channel_bindings b
        where b.channel = p_channel and b.provider_account_id = p_account;
      if v_existing is distinct from p_ws then
        perform private.people_audit(p_ws, p_actor, null, 'binding.add', 'refused_bound_elsewhere');
        return jsonb_build_object('reason', 'bound_elsewhere');
      end if;
    end if;
  end if;
  if not v_changed then
    return jsonb_build_object('reason', 'unchanged', 'generation', v_control.generation);
  end if;
  update private.people_registry_control c set generation = c.generation + 1 where c.ws_id = p_ws;
  perform private.people_audit(p_ws, p_actor, null,
    case when p_remove then 'binding.remove' else 'binding.add' end, 'updated');
  return jsonb_build_object('reason', 'updated', 'generation', v_control.generation + 1);
end;
$$;

-- tuturuuu: reviewed(function-grant) service role; registry owner only
create function private.people_registry_set_flags(
  p_ws uuid, p_actor uuid, p_capture_enabled boolean, p_personal_sessions_enabled boolean, p_stopped boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_control private.people_registry_control := private.people_require_actor(p_ws, p_actor, true);
begin
  update private.people_registry_control c set
    capture_enabled = coalesce(p_capture_enabled, c.capture_enabled),
    personal_sessions_enabled = coalesce(p_personal_sessions_enabled, c.personal_sessions_enabled),
    stopped = coalesce(p_stopped, c.stopped),
    generation = c.generation + 1
  where c.ws_id = p_ws;
  perform private.people_audit(p_ws, p_actor, null, 'registry.flags', 'updated');
  return jsonb_build_object('reason', 'updated', 'generation', v_control.generation + 1);
end;
$$;

-- Ownership transfer needs CREATE on the schema; it is revoked again below.
grant create on schema private to people_registry_definer;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'private.people_audit(uuid, uuid, uuid, text, text, text, uuid, uuid[])',
    'private.people_emit_change(uuid, uuid, uuid, private.people_change_kind)',
    'private.people_is_registry_owner(uuid, uuid, uuid)',
    'private.people_require_actor(uuid, uuid, boolean)',
    'private.people_registry_enable(uuid, uuid, jsonb)',
    'private.people_registry_get_control(uuid, uuid)',
    'private.people_registry_set_manager(uuid, uuid, uuid, timestamptz, boolean)',
    'private.people_registry_set_binding(uuid, uuid, private.people_channel, text, boolean)',
    'private.people_registry_set_flags(uuid, uuid, boolean, boolean, boolean)'
  ] loop
    execute format('alter function %s owner to people_registry_definer', v_signature);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_signature);
  end loop;
  foreach v_signature in array array[
    'private.people_registry_enable(uuid, uuid, jsonb)',
    'private.people_registry_get_control(uuid, uuid)',
    'private.people_registry_set_manager(uuid, uuid, uuid, timestamptz, boolean)',
    'private.people_registry_set_binding(uuid, uuid, private.people_channel, text, boolean)',
    'private.people_registry_set_flags(uuid, uuid, boolean, boolean, boolean)'
  ] loop
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$$;

revoke create on schema private from people_registry_definer;

commit;
