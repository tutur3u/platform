-- Restates people registry table, authority and lifecycle ACLs as static statements.
-- 20261121140000 to 20261121140004 applied the same grants through DO blocks;
-- the definitions below are unchanged and keep their owner.
begin;
set local lock_timeout = '3s';

revoke all on table private.people_registry_control from public, anon, authenticated, service_role;
revoke all on table private.people_workspace_keys from public, anon, authenticated, service_role;
revoke all on table private.people_registry_managers from public, anon, authenticated, service_role;
revoke all on table private.people_channel_bindings from public, anon, authenticated, service_role;
revoke all on table private.people_persons from public, anon, authenticated, service_role;
revoke all on table private.people_channel_identities from public, anon, authenticated, service_role;
revoke all on table private.people_conversations from public, anon, authenticated, service_role;
revoke all on table private.people_conversation_members from public, anon, authenticated, service_role;
revoke all on table private.people_relationships from public, anon, authenticated, service_role;
revoke all on table private.people_facts from public, anon, authenticated, service_role;
revoke all on table private.people_briefs from public, anon, authenticated, service_role;
revoke all on table private.people_rules from public, anon, authenticated, service_role;
revoke all on table private.people_consents from public, anon, authenticated, service_role;
revoke all on table private.people_suppressions from public, anon, authenticated, service_role;
revoke all on table private.people_change_events from public, anon, authenticated, service_role;
revoke all on table private.people_audit_events from public, anon, authenticated, service_role;
revoke all on sequence private.people_change_events_event_id_seq, private.people_audit_events_id_seq
  from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
revoke all on function private.people_audit(uuid, uuid, uuid, text, text, text, uuid, uuid[]) from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
revoke all on function private.people_emit_change(uuid, uuid, uuid, private.people_change_kind) from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
revoke all on function private.people_is_registry_owner(uuid, uuid, uuid) from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
revoke all on function private.people_require_actor(uuid, uuid, boolean) from public, anon, authenticated, service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_registry_enable
create or replace function private.people_registry_enable(p_ws uuid, p_actor uuid, p_wrapped_keys jsonb)
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
revoke all on function private.people_registry_enable(uuid, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function private.people_registry_enable(uuid, uuid, jsonb) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_registry_get_control
create or replace function private.people_registry_get_control(p_ws uuid, p_actor uuid)
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
revoke all on function private.people_registry_get_control(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.people_registry_get_control(uuid, uuid) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_registry_set_manager
create or replace function private.people_registry_set_manager(
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
revoke all on function private.people_registry_set_manager(uuid, uuid, uuid, timestamptz, boolean) from public, anon, authenticated, service_role;
grant execute on function private.people_registry_set_manager(uuid, uuid, uuid, timestamptz, boolean) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_registry_set_binding
create or replace function private.people_registry_set_binding(
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
revoke all on function private.people_registry_set_binding(uuid, uuid, private.people_channel, text, boolean) from public, anon, authenticated, service_role;
grant execute on function private.people_registry_set_binding(uuid, uuid, private.people_channel, text, boolean) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_registry_set_flags
create or replace function private.people_registry_set_flags(
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
revoke all on function private.people_registry_set_flags(uuid, uuid, boolean, boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function private.people_registry_set_flags(uuid, uuid, boolean, boolean, boolean) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_begin_delete
create or replace function private.people_begin_delete(
  p_ws uuid, p_actor uuid, p_person uuid, p_without_suppression boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_person private.people_persons;
begin
  perform private.people_require_actor(p_ws, p_actor, true);
  v_person := private.people_lock_person(p_ws, p_person);
  if v_person.is_owner then
    raise exception 'The owner row cannot be deleted' using errcode = '55000';
  end if;
  if p_without_suppression is null then
    raise exception 'Choose whether deletion keeps suppression' using errcode = '22023';
  end if;

  update private.people_persons p set status = 'deleting' where p.ws_id = p_ws and p.id = p_person;
  if not p_without_suppression then
    insert into private.people_suppressions (ws_id, token, key_version)
      select p_ws, i.suppression_token, i.suppression_key_version
      from private.people_channel_identities i
      where i.ws_id = p_ws and i.person_id = p_person
      on conflict do nothing;
  end if;
  perform private.people_bump_person(p_ws, p_person, true);
  perform private.people_emit_change(p_ws, p_person, null, 'delete');
  perform private.people_audit(p_ws, p_actor, null, 'person.delete',
    case when p_without_suppression then 'fenced_without_suppression' else 'fenced' end,
    'manage', null, array[p_person]);
  return jsonb_build_object('reason', 'fenced', 'version', v_person.version + 1);
end;
$$;
revoke all on function private.people_begin_delete(uuid, uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function private.people_begin_delete(uuid, uuid, uuid, boolean) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_finish_delete
create or replace function private.people_finish_delete(p_ws uuid, p_actor uuid, p_person uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.people_require_actor(p_ws, p_actor, true);
  perform 1 from private.people_persons p
    where p.ws_id = p_ws and p.id = p_person and p.status = 'deleting' for update;
  if not found then
    return jsonb_build_object('reason', 'not_deleting');
  end if;

  delete from private.people_facts f where f.ws_id = p_ws and f.person_id = p_person;
  delete from private.people_briefs b where b.ws_id = p_ws and b.person_id = p_person;
  delete from private.people_rules r where r.ws_id = p_ws and r.person_id = p_person;
  delete from private.people_relationships r
    where r.ws_id = p_ws and (r.from_person_id = p_person or r.to_person_id = p_person);
  delete from private.people_conversation_members m where m.ws_id = p_ws and m.person_id = p_person;
  delete from private.people_channel_identities i where i.ws_id = p_ws and i.person_id = p_person;
  delete from private.people_consents c where c.ws_id = p_ws and c.person_id = p_person;
  update private.people_persons p set
    status = 'deleted', label = 'deleted', contact_id = null, linked_user_id = null,
    version = p.version + 1, updated_at = clock_timestamp()
  where p.ws_id = p_ws and p.id = p_person;
  perform private.people_audit(p_ws, p_actor, null, 'person.delete', 'deleted', 'manage', null, array[p_person]);
  return jsonb_build_object('reason', 'deleted');
end;
$$;
revoke all on function private.people_finish_delete(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.people_finish_delete(uuid, uuid, uuid) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_lift_suppression
create or replace function private.people_lift_suppression(
  p_ws uuid, p_actor uuid, p_token bytea, p_key_version smallint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.people_require_actor(p_ws, p_actor, true);
  delete from private.people_suppressions s
    where s.ws_id = p_ws and s.token = p_token and s.key_version = p_key_version;
  perform private.people_audit(p_ws, p_actor, null, 'suppression.lift',
    case when found then 'lifted' else 'not_found' end);
  return jsonb_build_object('reason', case when found then 'lifted' else 'not_found' end);
end;
$$;
revoke all on function private.people_lift_suppression(uuid, uuid, bytea, smallint) from public, anon, authenticated, service_role;
grant execute on function private.people_lift_suppression(uuid, uuid, bytea, smallint) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_list_persons
create or replace function private.people_list_persons(
  p_ws uuid, p_actor uuid, p_query text, p_limit integer, p_after uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_needle text := lower(coalesce(btrim(p_query), ''));
begin
  perform private.people_require_actor(p_ws, p_actor, false);
  return coalesce((
    select jsonb_agg(row_data order by label_key, id)
    from (
      select p.id, lower(p.label) as label_key, jsonb_build_object(
        'id', p.id, 'kind', p.kind, 'label', p.label, 'status', p.status, 'isOwner', p.is_owner,
        'version', p.version, 'updatedAt', p.updated_at,
        'identityCount', (select count(*) from private.people_channel_identities i
          where i.ws_id = p_ws and i.person_id = p.id and i.link_state = 'confirmed')
      ) as row_data
      from private.people_persons p
      where p.ws_id = p_ws and p.status = 'active'
        and (v_needle = '' or strpos(lower(p.label), v_needle) > 0)
        and (p_after is null or (lower(p.label), p.id) > (
          select lower(a.label), a.id from private.people_persons a
          where a.ws_id = p_ws and a.id = p_after and a.status = 'active'
        ))
      order by lower(p.label), p.id
      limit v_limit
    ) page
  ), '[]'::jsonb);
end;
$$;
revoke all on function private.people_list_persons(uuid, uuid, text, integer, uuid) from public, anon, authenticated, service_role;
grant execute on function private.people_list_persons(uuid, uuid, text, integer, uuid) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_get_person
create or replace function private.people_get_person(p_ws uuid, p_actor uuid, p_person uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_person private.people_persons;
begin
  perform private.people_require_actor(p_ws, p_actor, false);
  select * into v_person from private.people_persons p where p.ws_id = p_ws and p.id = p_person;
  if not found or v_person.status = 'deleted' then
    return null;
  end if;
  perform private.people_audit(p_ws, p_actor, null, 'person.read', 'read', 'manage', null, array[p_person]);
  if v_person.status <> 'active' then
    return jsonb_build_object('id', v_person.id, 'status', v_person.status, 'version', v_person.version);
  end if;
  return jsonb_build_object(
    'id', v_person.id, 'kind', v_person.kind, 'label', v_person.label, 'status', v_person.status,
    'isOwner', v_person.is_owner, 'contactId', v_person.contact_id, 'linkedUserId', v_person.linked_user_id,
    'version', v_person.version, 'consentVersion', v_person.consent_version,
    'identities', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'channel', i.channel, 'providerAccountId', i.provider_account_id,
      'verification', i.verification, 'linkState', i.link_state, 'basis', i.basis,
      'keyVersion', i.key_version, 'displayCiphertext', encode(i.display_ciphertext, 'base64'),
      'decidedAt', i.decided_at, 'createdAt', i.created_at) order by i.created_at)
      from private.people_channel_identities i where i.ws_id = p_ws and i.person_id = p_person), '[]'::jsonb),
    'fleetIdentities', case when v_person.linked_user_id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('channel', f.channel, 'providerAccountId', f.provider_account_id,
        'verifiedAt', f.verified_at))
      from private.fleet_list_user_channel_identities(v_person.linked_user_id) f), '[]'::jsonb) end,
    'facts', coalesce((select jsonb_agg(jsonb_build_object(
      'key', f.key, 'value', f.value, 'revision', f.revision, 'ownerEntered', f.owner_entered,
      'audience', f.audience, 'audienceConversationIds', f.audience_conversation_ids, 'ownerDm', f.owner_dm,
      'originConversationId', f.origin_conversation_id, 'provenance', f.provenance,
      'updatedAt', f.updated_at) order by f.key)
      from private.people_facts f where f.ws_id = p_ws and f.person_id = p_person), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(jsonb_build_object(
      'rule', r.rule, 'value', r.value, 'expiresAt', r.expires_at, 'revision', r.revision,
      'expired', r.expires_at is not null and r.expires_at <= clock_timestamp()) order by r.rule)
      from private.people_rules r where r.ws_id = p_ws and r.person_id = p_person), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(jsonb_build_object(
      'store', c.store,
      'state', case when c.state = 'granted' and c.expires_at <= clock_timestamp() then 'expired'::text
        else c.state::text end,
      'basis', c.basis, 'scope', c.scope, 'recordedAt', c.recorded_at, 'expiresAt', c.expires_at)
      order by c.store)
      from private.people_consents c where c.ws_id = p_ws and c.person_id = p_person), '[]'::jsonb),
    'relationships', coalesce((select jsonb_agg(jsonb_build_object(
      'direction', case when r.from_person_id = p_person then 'out' else 'in' end,
      'otherId', o.id, 'otherLabel', o.label, 'kind', r.kind, 'label', r.label,
      'confidence', r.confidence) order by r.kind, o.label)
      from private.people_relationships r
      join private.people_persons o on o.ws_id = p_ws and o.status = 'active'
        and o.id = case when r.from_person_id = p_person then r.to_person_id else r.from_person_id end
      where r.ws_id = p_ws and (r.from_person_id = p_person or r.to_person_id = p_person)), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(row_to_json(a)::jsonb order by a."createdAt" desc) from (
      select e.id, e.action, e.reason_code as "reasonCode", e.purpose, e.principal_id as "principalId",
        e.actor_user_id as "actorUserId", e.conversation_id as "conversationId", e.created_at as "createdAt"
      from private.people_audit_events e
      where e.ws_id = p_ws and e.record_ids @> array[p_person]
      order by e.created_at desc limit 50) a), '[]'::jsonb)
  );
end;
$$;
revoke all on function private.people_get_person(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.people_get_person(uuid, uuid, uuid) to service_role;

commit;
