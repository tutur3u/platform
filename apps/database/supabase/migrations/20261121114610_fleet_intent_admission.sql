begin;

create table private.fleet_identity_link_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code_hash bytea not null unique check (octet_length(code_hash) = 32),
  expires_at timestamptz not null,
  pending_id uuid unique,
  confirmation_hash bytea check (octet_length(confirmation_hash) = 32),
  channel text check (channel in ('whatsapp', 'zalo', 'discord')),
  provider_account_id text,
  provider_account_label text check (length(provider_account_label) between 1 and 80),
  sender_hash bytea check (octet_length(sender_hash) = 32),
  conversation_hash text,
  check (num_nonnulls(pending_id, confirmation_hash, channel, provider_account_id,
    provider_account_label, sender_hash, conversation_hash) in (0, 7))
);

create table private.fleet_provider_events (
  channel text not null check (channel in ('whatsapp', 'zalo', 'discord')),
  provider_account_id text not null,
  event_hash bytea not null check (octet_length(event_hash) = 32),
  consumed_at timestamptz not null default clock_timestamp(),
  primary key (channel, provider_account_id, event_hash)
);

create index fleet_identity_link_codes_expiry on private.fleet_identity_link_codes (expires_at);
create index fleet_provider_events_retention on private.fleet_provider_events (consumed_at);

alter table private.fleet_audit_events alter column actor_id drop not null;
alter table private.fleet_audit_events add constraint fleet_audit_actor_or_desk_refusal check (
  actor_id is not null or (channel in ('whatsapp', 'zalo', 'discord') and (
    (action = 'intent.submit' and reason_code in ('event_replayed', 'unlinked_identity'))
    or (action = 'identity.verify' and reason_code in ('event_replayed', 'invalid_link_code'))
  ))
);

alter table private.fleet_identity_link_codes enable row level security;
alter table private.fleet_provider_events enable row level security;
revoke all on private.fleet_identity_link_codes, private.fleet_provider_events
  from public, anon, authenticated, service_role;

create function private.fleet_create_link_code(p_actor_id uuid, p_code_hash bytea)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege;
  end if;
  if private.fleet_get_access(p_actor_id) -> 'enabled' is distinct from 'true'::jsonb then
    return false;
  end if;
  insert into private.fleet_identity_link_codes (user_id, code_hash, expires_at)
    values (p_actor_id, p_code_hash, clock_timestamp() + interval '10 minutes')
    on conflict (user_id) do update set code_hash = excluded.code_hash,
      expires_at = clock_timestamp() + interval '10 minutes',
      pending_id = null, confirmation_hash = null, channel = null,
      provider_account_id = null, provider_account_label = null,
      sender_hash = null, conversation_hash = null;
  return true;
end;
$$;
revoke all on function private.fleet_create_link_code(uuid, bytea)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_create_link_code(uuid, bytea) to service_role;

-- tuturuuu: no-grant (internal)
create function private.fleet_consume_provider_event(p_event jsonb)
returns boolean
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  insert into private.fleet_provider_events (channel, provider_account_id, event_hash)
    values (p_event ->> 'channel', p_event ->> 'account', decode(p_event ->> 'eventHash', 'hex'))
    on conflict do nothing;
  return found;
end;
$$;
revoke all on function private.fleet_consume_provider_event(jsonb)
  from public, anon, authenticated, service_role;

create function private.fleet_verify_link_code(p_code_hash bytea, p_confirmation_hash bytea, p_event jsonb)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_pending_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege;
  end if;
  if not private.fleet_consume_provider_event(p_event) then
    insert into private.fleet_audit_events (channel, action, reason_code)
      values (p_event ->> 'channel', 'identity.verify', 'event_replayed');
    return jsonb_build_object('reason', 'event_replayed');
  end if;
  delete from private.fleet_identity_link_codes
    where code_hash = p_code_hash and expires_at <= clock_timestamp();
  update private.fleet_identity_link_codes l set
    pending_id = gen_random_uuid(), confirmation_hash = p_confirmation_hash,
    channel = p_event ->> 'channel', provider_account_id = p_event ->> 'account',
    provider_account_label = p_event ->> 'accountLabel',
    sender_hash = decode(p_event ->> 'senderHash', 'hex'),
    conversation_hash = p_event ->> 'conversationHash'
  where l.code_hash = p_code_hash and l.pending_id is null
    and l.expires_at > clock_timestamp()
    and private.fleet_get_access(l.user_id) -> 'enabled' = 'true'::jsonb
  returning l.pending_id into v_pending_id;
  if not found then
    insert into private.fleet_audit_events (channel, action, reason_code)
      values (p_event ->> 'channel', 'identity.verify', 'invalid_link_code');
    return jsonb_build_object('reason', 'invalid_link_code');
  end if;
  return jsonb_build_object('reason', 'pending', 'linkId', v_pending_id);
end;
$$;
revoke all on function private.fleet_verify_link_code(bytea, bytea, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_verify_link_code(bytea, bytea, jsonb) to service_role;

create function private.fleet_confirm_link_code(
  p_actor_id uuid, p_pending_id uuid, p_confirmation_hash bytea, p_preview boolean default false
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_link private.fleet_identity_link_codes%rowtype;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege;
  end if;
  delete from private.fleet_identity_link_codes
    where user_id = p_actor_id and expires_at <= clock_timestamp();
  if private.fleet_get_access(p_actor_id) -> 'enabled' is distinct from 'true'::jsonb then
    return jsonb_build_object('reason', 'inactive_grant');
  end if;
  select l.* into v_link from private.fleet_identity_link_codes l
  where l.user_id = p_actor_id and l.pending_id = p_pending_id
    and l.confirmation_hash = p_confirmation_hash
  for update;
  if not found then
    return jsonb_build_object('reason', 'invalid_confirmation');
  end if;
  if v_link.expires_at <= clock_timestamp() then
    delete from private.fleet_identity_link_codes where user_id = p_actor_id;
    return jsonb_build_object('reason', 'invalid_confirmation');
  end if;

  if p_preview is true then
    return jsonb_build_object('reason', 'pending', 'channel', v_link.channel,
      'accountLabel', v_link.provider_account_label);
  end if;
  delete from private.fleet_identity_link_codes where user_id = p_actor_id;
  insert into private.fleet_channel_identities
    (user_id, channel, provider_account_id, sender_hash, private_conversation_id)
    values (v_link.user_id, v_link.channel, v_link.provider_account_id,
      v_link.sender_hash, v_link.conversation_hash)
    on conflict (channel, provider_account_id, sender_hash) do nothing;
  if not found then
    return jsonb_build_object('reason', 'identity_already_linked');
  end if;
  return jsonb_build_object('reason', 'confirmed', 'channel', v_link.channel,
    'accountLabel', v_link.provider_account_label);
end;
$$;
revoke all on function private.fleet_confirm_link_code(uuid, uuid, bytea, boolean)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_confirm_link_code(uuid, uuid, bytea, boolean) to service_role;

create function private.fleet_submit_resolved_intent(
  p_kind private.fleet_intent_kind,
  p_project_key text,
  p_target_key text,
  p_parameters jsonb,
  p_actor_id uuid default null,
  p_event jsonb default null,
  p_redacted_quote text default null
)
returns table (intent_id uuid, reason_code text)
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := p_actor_id;
  v_channel text := 'web';
  v_desk_refusal text;
  v_target_type text;
  v_target_id text;
  v_project_key text;
  v_project_version bigint;
  v_payload jsonb;
  v_versions jsonb;
begin
  if auth.role() is distinct from 'service_role' or num_nonnulls(p_actor_id, p_event) <> 1 then
    raise insufficient_privilege;
  end if;

  if p_event is not null then
    v_channel := p_event ->> 'channel';
    if not private.fleet_consume_provider_event(p_event) then
      v_desk_refusal := 'event_replayed';
    else
      select i.user_id into v_actor
      from private.fleet_channel_identities i
      where i.channel = v_channel and i.provider_account_id = p_event ->> 'account'
        and i.sender_hash = decode(p_event ->> 'senderHash', 'hex')
        and i.private_conversation_id = p_event ->> 'conversationHash'
      for share;
      if not found then
        v_desk_refusal := 'unlinked_identity';
      end if;
    end if;
    if v_desk_refusal is not null then
      insert into private.fleet_audit_events (channel, action, reason_code)
        values (v_channel, 'intent.submit', v_desk_refusal);
      return query select null::uuid, v_desk_refusal;
      return;
    end if;
  end if;

  v_target_type := case p_kind
    when 'status_question' then null
    when 'comment' then 'lane'
    when 'priority.set' then 'lane'
    when 'approve.item' then 'readiness_item'
    when 'work.create' then 'repository_path'
    when 'work.redirect' then 'thread'
    when 'lane.pause' then 'lane'
    when 'approve.deploy' then 'deployment'
    when 'approve.production_change' then 'production_change'
  end;

  -- Serialize against catalog writes, including adding a duplicate alias to
  -- another project while the owning row and its version stay unchanged.
  lock table private.fleet_projects in share mode;
  if v_target_type is null then
    select p.key, p.target_mapping_version
    into v_project_key, v_project_version
    from private.fleet_projects p where p.key = p_project_key;
  else
    select min(p.key), min(p.target_mapping_version),
      min(p.target_mapping -> v_target_type ->> p_target_key)
    into v_project_key, v_project_version, v_target_id
    from private.fleet_projects p
    where (p.target_mapping -> v_target_type) ? p_target_key
    having count(*) = 1;
    if coalesce(v_target_id, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_project_key := null;
    end if;
  end if;

  if v_project_key is distinct from p_project_key or v_project_key is null then
    insert into private.fleet_audit_events (actor_id, channel, action, reason_code)
      values (v_actor, v_channel, 'intent.submit', 'project_outside_grant');
    return query select null::uuid, 'project_outside_grant'::text;
    return;
  end if;

  v_payload := p_parameters || jsonb_strip_nulls(jsonb_build_object(
    'targetType', v_target_type, 'targetId', v_target_id
  ));
  v_versions := jsonb_build_object(v_project_key, v_project_version);
  return query select s.intent_id, s.reason_code from private.fleet_submit_intent(
    v_actor, v_channel, p_kind, v_payload,
    sha256(convert_to(jsonb_build_object(
      'kind', p_kind, 'projects', v_versions, 'payload', v_payload
    )::text, 'UTF8')),
    v_versions, p_redacted_quote
  ) s;
end;
$$;
revoke all on function private.fleet_submit_resolved_intent(private.fleet_intent_kind, text, text, jsonb, uuid, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_submit_resolved_intent(private.fleet_intent_kind, text, text, jsonb, uuid, jsonb, text)
  to service_role;

create index fleet_intents_requester_receipts on private.fleet_intents (requester_id, created_at desc, id desc);

create function private.fleet_list_intents(p_actor_id uuid, p_before uuid default null)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, pg_temp
as $$
  with access as (
    select private.fleet_get_access(p_actor_id) as data
  ), visible as (
    select i.id, i.kind, i.state, i.created_at, i.expires_at
    from private.fleet_intents i cross join access
    where i.requester_id = p_actor_id and access.data -> 'enabled' = 'true'::jsonb
      and (access.data -> 'projects') ?& array(select jsonb_object_keys(i.project_versions))
      and (p_before is null or (i.created_at, i.id) < (
        select b.created_at, b.id from private.fleet_intents b
        where b.requester_id = p_actor_id and b.id = p_before
          and (access.data -> 'projects') ?& array(select jsonb_object_keys(b.project_versions))
      ))
    order by i.created_at desc, i.id desc limit 51
  )
  select case when auth.role() = 'service_role' and access.data -> 'enabled' = 'true'::jsonb then
    coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'kind', v.kind, 'state', case
        when v.state = 'pending_approval' and v.expires_at <= statement_timestamp()
          then 'expired'::private.fleet_intent_state
        else v.state end,
      'createdAt', to_char(v.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) order by v.created_at desc, v.id desc) from visible v), '[]'::jsonb)
  end from access;
$$;
revoke all on function private.fleet_list_intents(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_list_intents(uuid, uuid) to service_role;

commit;
