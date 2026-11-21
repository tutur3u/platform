begin;

-- Server-owned RPCs for Mira channels. Callers (apps/web tenant routes, the
-- apps/infrastructure operator routes and the channel Worker) authorize the
-- actor first; every RPC still checks that the channel belongs to the
-- workspace argument, so a wrong workspace never reaches another tenant.

-- tuturuuu: no-grant (internal)
create function private.mira_reason_authority_allowed(p_reason text, p_authority text)
returns boolean
language sql immutable
set search_path = pg_catalog, pg_temp
as $$
  select case p_reason
    when 'tenant' then p_authority = 'tenant_manager'
    when 'operator' then p_authority = 'operator'
    when 'billing' then p_authority = 'billing'
    -- Caps clear only through the system or a raised cap in settings.
    when 'cap' then p_authority = 'system'
    else false
  end
$$;
revoke all on function private.mira_reason_authority_allowed(text, text) from public, anon, authenticated, service_role;

-- Sets or clears one stop reason. A clear removes only the caller's own
-- reason; other owners' reasons stay and are returned. Operator changes need
-- a note. A non-null expected generation makes the change compare-and-swap.
create function private.mira_set_stop_reason(
  p_ws_id uuid,
  p_channel_id uuid,
  p_reason text,
  p_stopped boolean,
  p_authority text,
  p_actor_id uuid,
  p_expected_generation bigint,
  p_note text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reasons text[];
  v_old bigint;
  v_generation bigint;
begin
  if p_ws_id is null or p_stopped is null
    or not coalesce(private.mira_reason_authority_allowed(p_reason, p_authority), false) then
    raise exception 'Stop reason not owned by this authority' using errcode = '42501';
  end if;
  if p_authority = 'operator' and (p_note is null or length(btrim(p_note)) = 0) then
    raise exception 'Operator stop changes need a note' using errcode = '22023';
  end if;
  if length(p_note) > 500 then
    raise exception 'Note is too long' using errcode = '22023';
  end if;

  if p_channel_id is null then
    select t.stop_generation into v_old from private.mira_tenants t
    where t.ws_id = p_ws_id for update;
  else
    select c.stop_generation into v_old from private.mira_channels c
    where c.id = p_channel_id and c.ws_id = p_ws_id and c.unbound_at is null for update;
  end if;
  if v_old is null then
    raise exception 'Mira tenant or channel not found' using errcode = 'P0002';
  end if;
  if p_expected_generation is not null and p_expected_generation <> v_old then
    raise exception 'Mira stop generation conflict' using errcode = '40001';
  end if;

  if p_channel_id is null then
    update private.mira_tenants t
    set stop_reasons = case when p_stopped
      then array_append(array_remove(t.stop_reasons, p_reason), p_reason)
      else array_remove(t.stop_reasons, p_reason) end
    where t.ws_id = p_ws_id
    returning t.stop_reasons, t.stop_generation into v_reasons, v_generation;
  else
    update private.mira_channels c
    set stop_reasons = case when p_stopped
      then array_append(array_remove(c.stop_reasons, p_reason), p_reason)
      else array_remove(c.stop_reasons, p_reason) end
    where c.id = p_channel_id and c.ws_id = p_ws_id
    returning c.stop_reasons, c.stop_generation into v_reasons, v_generation;
  end if;

  insert into private.mira_audit_events (ws_id, channel_id, actor_kind, actor_id, action,
    reason_code, old_generation, new_generation, note)
  values (p_ws_id, p_channel_id, p_authority, p_actor_id,
    case when p_stopped then 'stop.add' else 'stop.clear' end, p_reason,
    v_old, v_generation, nullif(btrim(p_note), ''));

  return jsonb_build_object('stopReasons', to_jsonb(v_reasons), 'stopGeneration', v_generation);
end;
$$;
revoke all on function private.mira_set_stop_reason(uuid, uuid, text, boolean, text, uuid, bigint, text) from public, anon, authenticated;
grant execute on function private.mira_set_stop_reason(uuid, uuid, text, boolean, text, uuid, bigint, text) to service_role;

create function private.mira_get_global_stop()
returns jsonb
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object('stopped', g.stopped, 'generation', g.generation,
    'updatedAt', g.updated_at, 'updatedBy', g.updated_by)
  from private.mira_global_control g
$$;
revoke all on function private.mira_get_global_stop() from public, anon, authenticated;
grant execute on function private.mira_get_global_stop() to service_role;

-- Operator-only global fence change, compare-and-swap on the generation.
create function private.mira_set_global_stop(
  p_stopped boolean,
  p_expected_generation bigint,
  p_actor_id uuid,
  p_note text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row private.mira_global_control;
begin
  if p_stopped is null or p_expected_generation is null or p_actor_id is null
    or p_note is null or length(btrim(p_note)) = 0 or length(p_note) > 500 then
    raise exception 'Invalid global stop request' using errcode = '22023';
  end if;
  select * into v_row from private.mira_global_control for update;
  if v_row.generation <> p_expected_generation then
    raise exception 'Mira global stop generation conflict' using errcode = '40001';
  end if;
  if v_row.stopped is distinct from p_stopped then
    update private.mira_global_control set stopped = p_stopped,
      generation = v_row.generation + 1, updated_at = clock_timestamp(), updated_by = p_actor_id
    returning * into v_row;
    insert into private.mira_audit_events (ws_id, actor_kind, actor_id, action, reason_code,
      old_generation, new_generation, note)
    values ('00000000-0000-0000-0000-000000000000', 'operator', p_actor_id,
      case when p_stopped then 'global_stop.add' else 'global_stop.clear' end, 'operator',
      p_expected_generation, v_row.generation, btrim(p_note));
  end if;
  return jsonb_build_object('stopped', v_row.stopped, 'generation', v_row.generation,
    'updatedAt', v_row.updated_at, 'updatedBy', v_row.updated_by);
end;
$$;
revoke all on function private.mira_set_global_stop(boolean, bigint, uuid, text) from public, anon, authenticated;
grant execute on function private.mira_set_global_stop(boolean, bigint, uuid, text) to service_role;

-- Operator audit log: bounded keyset pages, newest first, metadata and notes.
create function private.mira_list_audit_events(p_ws_id uuid, p_before bigint, p_limit integer)
returns table (
  id bigint, ws_id uuid, channel_id uuid, actor_kind text, actor_id uuid, action text,
  reason_code text, old_generation bigint, new_generation bigint, note text, created_at timestamptz
)
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select a.id, a.ws_id, a.channel_id, a.actor_kind, a.actor_id, a.action, a.reason_code,
    a.old_generation, a.new_generation, a.note, a.created_at
  from private.mira_audit_events a
  where (p_ws_id is null or a.ws_id = p_ws_id)
    and (p_before is null or a.id < p_before)
  order by a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;
revoke all on function private.mira_list_audit_events(uuid, bigint, integer) from public, anon, authenticated;
grant execute on function private.mira_list_audit_events(uuid, bigint, integer) to service_role;

-- Compare-and-swap update of tenant settings. A missing tenant is created only
-- when the caller expects no prior version. Unknown keys are rejected.
create function private.mira_update_tenant_settings(
  p_ws_id uuid,
  p_actor_id uuid,
  p_authority text,
  p_expected_config_version bigint,
  p_settings jsonb
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row private.mira_tenants;
  v_quiet jsonb;
  v_old_daily bigint;
  v_old_monthly bigint;
begin
  if p_ws_id is null or p_actor_id is null or jsonb_typeof(p_settings) is distinct from 'object'
    or p_authority is null or p_authority not in ('tenant_manager', 'billing') then
    raise exception 'Invalid Mira settings request' using errcode = '22023';
  end if;
  -- Only the model and quiet hours may be cleared with an explicit null.
  if exists (
    select 1 from jsonb_each(p_settings) e
    where jsonb_typeof(e.value) = 'null' and e.key not in ('modelId', 'quietHours')
  ) then
    raise exception 'Mira setting cannot be null' using errcode = '22023';
  end if;
  -- Billing adjusts plan caps only.
  if p_authority = 'billing' and exists (
    select 1 from jsonb_object_keys(p_settings) k
    where k not in ('dailyCapMicroUsd', 'monthlyCapMicroUsd')
  ) then
    raise exception 'Billing may change caps only' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_settings) k
    where k not in ('enabled', 'keyMode', 'preset', 'modelId', 'neverSilent',
      'quietHours', 'dailyCapMicroUsd', 'monthlyCapMicroUsd')
  ) then
    raise exception 'Unknown Mira setting' using errcode = '22023';
  end if;

  select * into v_row from private.mira_tenants where ws_id = p_ws_id for update;
  if not found then
    if p_expected_config_version is not null then
      raise exception 'Mira config version conflict' using errcode = '40001';
    end if;
    insert into private.mira_tenants (ws_id) values (p_ws_id)
    on conflict (ws_id) do nothing
    returning * into v_row;
    -- A concurrent first save already created the tenant.
    if not found then
      raise exception 'Mira config version conflict' using errcode = '40001';
    end if;
  elsif p_expected_config_version is distinct from v_row.config_version then
    raise exception 'Mira config version conflict' using errcode = '40001';
  end if;

  v_old_daily := v_row.daily_cap_micro_usd;
  v_old_monthly := v_row.monthly_cap_micro_usd;

  if p_settings ? 'quietHours' then
    v_quiet := p_settings -> 'quietHours';
    if jsonb_typeof(v_quiet) not in ('object', 'null') then
      raise exception 'Invalid quiet hours' using errcode = '22023';
    end if;
  end if;

  update private.mira_tenants t set
    enabled = coalesce((p_settings ->> 'enabled')::boolean, t.enabled),
    key_mode = coalesce((p_settings ->> 'keyMode')::private.mira_key_mode, t.key_mode),
    preset = coalesce((p_settings ->> 'preset')::private.mira_preset, t.preset),
    model_id = case when p_settings ? 'modelId' then p_settings ->> 'modelId' else t.model_id end,
    never_silent = coalesce((p_settings ->> 'neverSilent')::boolean, t.never_silent),
    quiet_start_minute = case when p_settings ? 'quietHours'
      then (v_quiet ->> 'startMinute')::smallint else t.quiet_start_minute end,
    quiet_end_minute = case when p_settings ? 'quietHours'
      then (v_quiet ->> 'endMinute')::smallint else t.quiet_end_minute end,
    quiet_time_zone = case when p_settings ? 'quietHours'
      then v_quiet ->> 'timeZone' else t.quiet_time_zone end,
    daily_cap_micro_usd = coalesce((p_settings ->> 'dailyCapMicroUsd')::bigint, t.daily_cap_micro_usd),
    monthly_cap_micro_usd = coalesce((p_settings ->> 'monthlyCapMicroUsd')::bigint, t.monthly_cap_micro_usd)
  where t.ws_id = p_ws_id
  returning * into v_row;

  -- A raised cap clears the cap stop; the runtime sets it again if the next
  -- reservation still exceeds a cap.
  if (p_settings ? 'dailyCapMicroUsd' or p_settings ? 'monthlyCapMicroUsd')
    and 'cap' = any (v_row.stop_reasons) then
    update private.mira_tenants t set stop_reasons = array_remove(t.stop_reasons, 'cap')
    where t.ws_id = p_ws_id
      and (t.daily_cap_micro_usd, t.monthly_cap_micro_usd) is distinct from
        (v_old_daily, v_old_monthly)
      and t.daily_cap_micro_usd >= v_old_daily and t.monthly_cap_micro_usd >= v_old_monthly;
    select * into v_row from private.mira_tenants where ws_id = p_ws_id;
  end if;

  insert into private.mira_audit_events (ws_id, actor_kind, actor_id, action, reason_code)
  values (p_ws_id, p_authority, p_actor_id, 'settings.update', 'saved');

  return jsonb_build_object('configVersion', v_row.config_version);
end;
$$;
revoke all on function private.mira_update_tenant_settings(uuid, uuid, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function private.mira_update_tenant_settings(uuid, uuid, text, bigint, jsonb) to service_role;

-- Records a binding after the caller verified provider proof (Embedded
-- Signup exchange, OAuth install callback or bot identity).
create function private.mira_bind_channel(
  p_ws_id uuid,
  p_actor_id uuid,
  p_kind private.mira_channel_kind,
  p_mode private.mira_connection_mode,
  p_provider_account_id text,
  p_display_name text
)
returns uuid
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from private.mira_tenants where ws_id = p_ws_id) then
    raise exception 'Mira tenant not found' using errcode = 'P0002';
  end if;
  begin
    insert into private.mira_channels (ws_id, kind, connection_mode, provider_account_id, display_name, send_owner)
    values (p_ws_id, p_kind, p_mode, p_provider_account_id, p_display_name, 'cloud')
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Provider account is already bound' using errcode = '23505';
  end;
  insert into private.mira_audit_events (ws_id, channel_id, actor_kind, actor_id, action, reason_code)
  values (p_ws_id, v_id, 'tenant_manager', p_actor_id, 'channel.bind', p_kind::text);
  return v_id;
end;
$$;
revoke all on function private.mira_bind_channel(uuid, uuid, private.mira_channel_kind, private.mira_connection_mode, text, text) from public, anon, authenticated;
grant execute on function private.mira_bind_channel(uuid, uuid, private.mira_channel_kind, private.mira_connection_mode, text, text) to service_role;

create function private.mira_unbind_channel(p_ws_id uuid, p_channel_id uuid, p_actor_id uuid)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_reasons text[];
begin
  select c.stop_reasons into v_reasons from private.mira_channels c
  where c.id = p_channel_id and c.ws_id = p_ws_id and c.unbound_at is null
  for update;
  if not found then
    return false;
  end if;
  -- Unbinding must not shed a stop the tenant does not own.
  if v_reasons && array['operator', 'billing', 'cap']::text[] then
    raise exception 'Channel has a stop the tenant does not own' using errcode = '42501';
  end if;
  update private.mira_channels set unbound_at = clock_timestamp(), status = 'draft'
  where id = p_channel_id;
  -- The caller purges the named vault variables before unbinding.
  delete from private.mira_channel_secret_refs where channel_id = p_channel_id;
  insert into private.mira_audit_events (ws_id, channel_id, actor_kind, actor_id, action, reason_code)
  values (p_ws_id, p_channel_id, 'tenant_manager', p_actor_id, 'channel.unbind', 'removed');
  return true;
end;
$$;
revoke all on function private.mira_unbind_channel(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.mira_unbind_channel(uuid, uuid, uuid) to service_role;

-- Adds settled usage once per receipt; a redelivered receipt returns false.
create function private.mira_record_usage(
  p_receipt_id uuid,
  p_ws_id uuid,
  p_channel_id uuid,
  p_model_id text,
  p_day date,
  p_usage jsonb
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_replies bigint := coalesce((p_usage ->> 'replies')::bigint, 0);
  v_weighted bigint := coalesce((p_usage ->> 'weightedReplies')::bigint, 0);
  v_triaged bigint := coalesce((p_usage ->> 'triaged')::bigint, 0);
  v_input bigint := coalesce((p_usage ->> 'inputTokens')::bigint, 0);
  v_cached bigint := coalesce((p_usage ->> 'cachedInputTokens')::bigint, 0);
  v_output bigint := coalesce((p_usage ->> 'outputTokens')::bigint, 0);
  v_cost bigint := coalesce((p_usage ->> 'costMicroUsd')::bigint, 0);
begin
  if p_receipt_id is null or p_day is null
    or least(v_replies, v_weighted, v_triaged) < 0
    or least(v_input, v_cached, v_output, v_cost) < 0 then
    raise exception 'Invalid Mira usage' using errcode = '22023';
  end if;
  -- Unbound channels still accept late settlement for turns they served.
  if not exists (select 1 from private.mira_channels where id = p_channel_id and ws_id = p_ws_id) then
    raise exception 'Mira channel not found in workspace' using errcode = 'P0002';
  end if;
  insert into private.mira_usage_receipts (receipt_id, ws_id) values (p_receipt_id, p_ws_id)
  on conflict (receipt_id) do nothing;
  if not found then
    return false;
  end if;
  insert into private.mira_usage_daily as u (ws_id, channel_id, model_id, day, replies,
    weighted_replies, triaged, input_tokens, cached_input_tokens, output_tokens, cost_micro_usd)
  values (p_ws_id, p_channel_id, p_model_id, p_day, v_replies, v_weighted, v_triaged,
    v_input, v_cached, v_output, v_cost)
  on conflict (ws_id, channel_id, model_id, day) do update set
    replies = u.replies + excluded.replies,
    weighted_replies = u.weighted_replies + excluded.weighted_replies,
    triaged = u.triaged + excluded.triaged,
    input_tokens = u.input_tokens + excluded.input_tokens,
    cached_input_tokens = u.cached_input_tokens + excluded.cached_input_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens,
    cost_micro_usd = u.cost_micro_usd + excluded.cost_micro_usd;
  return true;
end;
$$;
revoke all on function private.mira_record_usage(uuid, uuid, uuid, text, date, jsonb) from public, anon, authenticated;
grant execute on function private.mira_record_usage(uuid, uuid, uuid, text, date, jsonb) to service_role;

-- Tenant view: settings, persona, channels and secret reference names only.
create function private.mira_get_tenant(p_ws_id uuid)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'wsId', t.ws_id, 'enabled', t.enabled, 'keyMode', t.key_mode, 'preset', t.preset,
    'modelId', t.model_id, 'neverSilent', t.never_silent,
    'quietHours', case when t.quiet_time_zone is null then null else jsonb_build_object(
      'startMinute', t.quiet_start_minute, 'endMinute', t.quiet_end_minute,
      'timeZone', t.quiet_time_zone) end,
    'dailyCapMicroUsd', t.daily_cap_micro_usd, 'monthlyCapMicroUsd', t.monthly_cap_micro_usd,
    'stopReasons', to_jsonb(t.stop_reasons), 'stopGeneration', t.stop_generation,
    'configVersion', t.config_version,
    'persona', (select jsonb_build_object('name', p.name, 'instructions', p.instructions)
      from private.mira_personas p where p.ws_id = t.ws_id),
    'channels', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'connectionMode', c.connection_mode,
        'displayName', c.display_name, 'status', c.status,
        'stopReasons', to_jsonb(c.stop_reasons), 'stopGeneration', c.stop_generation,
        'sendOwner', c.send_owner, 'ownerGeneration', c.owner_generation,
        'lastErrorCode', c.last_error_code, 'lastErrorAt', c.last_error_at, 'lastEventAt', c.last_event_at,
        'secrets', coalesce((select jsonb_agg(jsonb_build_object(
            'name', r.name, 'connectedAt', r.connected_at) order by r.name)
          from private.mira_channel_secret_refs r where r.channel_id = c.id), '[]'::jsonb))
        order by c.created_at)
      from private.mira_channels c where c.ws_id = t.ws_id and c.unbound_at is null), '[]'::jsonb))
  from private.mira_tenants t
  where t.ws_id = p_ws_id
$$;
revoke all on function private.mira_get_tenant(uuid) from public, anon, authenticated;
grant execute on function private.mira_get_tenant(uuid) to service_role;

-- Operator overview across tenants: bounded keyset pages, metadata only.
create function private.mira_operator_overview(p_after uuid, p_limit integer)
returns table (
  ws_id uuid,
  enabled boolean,
  stop_reasons text[],
  channel_count integer,
  stopped_channel_count integer,
  last_error_at timestamptz,
  cost_micro_usd_7d bigint,
  replies_7d bigint
)
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  select t.ws_id, t.enabled, t.stop_reasons,
    (select count(*)::integer from private.mira_channels c
      where c.ws_id = t.ws_id and c.unbound_at is null),
    (select count(*)::integer from private.mira_channels c
      where c.ws_id = t.ws_id and c.unbound_at is null and cardinality(c.stop_reasons) > 0),
    (select max(c.last_error_at) from private.mira_channels c
      where c.ws_id = t.ws_id and c.unbound_at is null),
    coalesce((select sum(u.cost_micro_usd)::bigint from private.mira_usage_daily u
      where u.ws_id = t.ws_id and u.day > current_date - 7), 0),
    coalesce((select sum(u.replies)::bigint from private.mira_usage_daily u
      where u.ws_id = t.ws_id and u.day > current_date - 7), 0)
  from private.mira_tenants t
  where p_after is null or t.ws_id > p_after
  order by t.ws_id
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;
revoke all on function private.mira_operator_overview(uuid, integer) from public, anon, authenticated;
grant execute on function private.mira_operator_overview(uuid, integer) to service_role;

commit;
