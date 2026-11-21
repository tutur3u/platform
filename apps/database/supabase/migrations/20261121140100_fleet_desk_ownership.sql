begin;

-- One authoritative admission owner per provider account. Deployment
-- configuration carries key material only; this row decides which desk,
-- credential version and generation the database admits.
create table private.fleet_desk_owners (
  channel text not null check (channel in ('whatsapp', 'zalo', 'discord')),
  provider_account_id text not null check (provider_account_id collate "C" ~ '^[!-~]{1,200}$'),
  provider_account_label text not null check (length(btrim(provider_account_label)) between 1 and 80),
  desk_id text not null unique check (desk_id collate "C" ~ '^[a-z0-9-]{1,40}$'),
  credential_version integer not null check (credential_version > 0),
  owner_generation bigint not null default 1 check (owner_generation > 0),
  quiesced boolean not null default true,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (channel, provider_account_id)
);

-- Every credential ever admitted. A retired desk credential cannot return,
-- even on another provider account.
create table private.fleet_desk_credentials (
  desk_id text not null,
  credential_version integer not null,
  channel text not null,
  provider_account_id text not null,
  assigned_at timestamptz not null default clock_timestamp(),
  primary key (desk_id, credential_version)
);

alter table private.fleet_desk_owners enable row level security;
alter table private.fleet_desk_credentials enable row level security;
revoke all on private.fleet_desk_owners, private.fleet_desk_credentials
  from public, anon, authenticated, service_role;

create trigger fleet_desk_owner_no_reset
before delete or truncate on private.fleet_desk_owners
for each statement execute function private.fleet_reject_fence_reset();

create trigger fleet_desk_credential_history
before update or delete or truncate on private.fleet_desk_credentials
for each statement execute function private.fleet_reject_fence_reset();

-- tuturuuu: no-grant (trigger)
create function private.fleet_check_desk_owner()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.owner_generation <> 1 then
      raise exception 'Fleet desk owners start at generation one' using errcode = '55000';
    end if;
  elsif (new.channel, new.provider_account_id, new.provider_account_label)
      is distinct from (old.channel, old.provider_account_id, old.provider_account_label)
    or new.owner_generation is distinct from old.owner_generation + 1
    or new.credential_version < old.credential_version
    or ((new.desk_id, new.credential_version) is distinct from (old.desk_id, old.credential_version)
      and new.credential_version = old.credential_version) then
    raise exception 'Fleet desk owner changes advance one generation' using errcode = '55000';
  end if;

  if tg_op = 'INSERT'
    or (new.desk_id, new.credential_version) is distinct from (old.desk_id, old.credential_version) then
    insert into private.fleet_desk_credentials (desk_id, credential_version, channel, provider_account_id)
      values (new.desk_id, new.credential_version, new.channel, new.provider_account_id)
      on conflict do nothing;
    if not found then
      raise exception 'Fleet desk credential version already used' using errcode = '22023';
    end if;
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.fleet_check_desk_owner() from public, anon, authenticated, service_role;

create trigger fleet_check_desk_owner
before insert or update on private.fleet_desk_owners
for each row execute function private.fleet_check_desk_owner();

alter table private.fleet_audit_events add column desk_owner_change jsonb;
alter table private.fleet_audit_events drop constraint fleet_audit_actor_or_desk_refusal;
alter table private.fleet_audit_events add constraint fleet_audit_actor_or_desk_refusal check (
  actor_id is not null or (channel in ('whatsapp', 'zalo', 'discord') and (
    (action in ('intent.submit', 'identity.verify', 'digest.read')
      and reason_code in ('event_replayed', 'unauthorized_desk_event'))
    or (action in ('intent.submit', 'digest.read') and reason_code = 'unlinked_identity')
    or (action = 'identity.verify' and reason_code = 'invalid_link_code')
  )) or (channel = 'web' and action = 'retention.purge' and reason_code = 'purged'
    and jsonb_typeof(retention_counts) is not distinct from 'object')
);

-- Callers hold the Owner check. Each change advances the generation once
-- and appends an audit event carrying the new owner state.
-- tuturuuu: no-grant (internal)
create function private.fleet_change_desk_owner(
  p_actor uuid, p_channel text, p_account text, p_action text,
  p_expected_generation bigint, p_desk_id text default null,
  p_credential_version integer default null
)
returns jsonb
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_owner private.fleet_desk_owners%rowtype;
  v_change jsonb;
begin
  select * into v_owner from private.fleet_desk_owners
  where channel = p_channel and provider_account_id = p_account for update;
  if not found or v_owner.owner_generation is distinct from p_expected_generation then
    raise exception 'Fleet desk owner generation changed' using errcode = '55000';
  end if;

  case p_action
    when 'quiesce', 'resume' then
      if v_owner.quiesced = (p_action = 'quiesce') then
        raise exception 'Invalid Fleet desk quiesce transition' using errcode = '22023';
      end if;
      v_owner.quiesced := p_action = 'quiesce';
    when 'rotate', 'promote', 'rollback' then
      if p_desk_id is null or p_credential_version is null
        or p_credential_version <= v_owner.credential_version
        or (p_action = 'rotate') is distinct from (p_desk_id = v_owner.desk_id)
        or (p_action <> 'rotate' and not v_owner.quiesced) then
        raise exception 'Invalid Fleet desk credential or cutover state' using errcode = '22023';
      end if;
      v_owner.desk_id := p_desk_id;
      v_owner.credential_version := p_credential_version;
    else
      raise exception 'Unknown Fleet desk change' using errcode = '22023';
  end case;

  update private.fleet_desk_owners set
    desk_id = v_owner.desk_id, credential_version = v_owner.credential_version,
    quiesced = v_owner.quiesced, owner_generation = owner_generation + 1
  where channel = p_channel and provider_account_id = p_account
  returning * into v_owner;

  v_change := jsonb_build_object(
    'account', v_owner.provider_account_id, 'deskId', v_owner.desk_id,
    'credentialVersion', v_owner.credential_version,
    'ownerGeneration', v_owner.owner_generation::text, 'quiesced', v_owner.quiesced
  );
  insert into private.fleet_audit_events (actor_id, channel, action, reason_code, desk_owner_change)
    values (p_actor, p_channel, 'desk.owner.change', p_action, v_change);
  return v_change;
end;
$$;
revoke all on function private.fleet_change_desk_owner(uuid, text, text, text, bigint, text, integer)
  from public, anon, authenticated, service_role;

-- Registration starts quiesced. Resume after the verifier configuration and
-- the readback agree.
-- tuturuuu: no-grant (verified database-owner connection only)
create function private.fleet_register_desk_owner(
  p_channel text, p_account text, p_account_label text,
  p_desk_id text, p_credential_version integer
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_actor uuid := private.fleet_require_owner();
  v_owner private.fleet_desk_owners%rowtype;
  v_change jsonb;
begin
  insert into private.fleet_desk_owners (
    channel, provider_account_id, provider_account_label, desk_id, credential_version
  ) values (p_channel, p_account, btrim(p_account_label), p_desk_id, p_credential_version)
  returning * into v_owner;

  v_change := jsonb_build_object(
    'account', v_owner.provider_account_id, 'deskId', v_owner.desk_id,
    'credentialVersion', v_owner.credential_version,
    'ownerGeneration', v_owner.owner_generation::text, 'quiesced', v_owner.quiesced
  );
  insert into private.fleet_audit_events (actor_id, channel, action, reason_code, desk_owner_change)
    values (v_actor, p_channel, 'desk.owner.change', 'register', v_change);
  return v_change;
end;
$$;
revoke all on function private.fleet_register_desk_owner(text, text, text, text, integer)
  from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (verified database-owner connection only)
create function private.fleet_quiesce_desk_owner(
  p_channel text, p_account text, p_expected_generation bigint
)
returns jsonb
language sql security definer
set search_path = pg_catalog, pg_temp
as $$
  select private.fleet_change_desk_owner(private.fleet_require_owner(),
    p_channel, p_account, 'quiesce', p_expected_generation);
$$;
revoke all on function private.fleet_quiesce_desk_owner(text, text, bigint)
  from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (verified database-owner connection only)
create function private.fleet_resume_desk_owner(
  p_channel text, p_account text, p_expected_generation bigint
)
returns jsonb
language sql security definer
set search_path = pg_catalog, pg_temp
as $$
  select private.fleet_change_desk_owner(private.fleet_require_owner(),
    p_channel, p_account, 'resume', p_expected_generation);
$$;
revoke all on function private.fleet_resume_desk_owner(text, text, bigint)
  from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (verified database-owner connection only)
create function private.fleet_rotate_desk_credential(
  p_channel text, p_account text, p_expected_generation bigint, p_credential_version integer
)
returns jsonb
language sql security definer
set search_path = pg_catalog, pg_temp
as $$
  select private.fleet_change_desk_owner(private.fleet_require_owner(),
    p_channel, p_account, 'rotate', p_expected_generation,
    (select d.desk_id from private.fleet_desk_owners d
     where d.channel = p_channel and d.provider_account_id = p_account),
    p_credential_version);
$$;
revoke all on function private.fleet_rotate_desk_credential(text, text, bigint, integer)
  from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (verified database-owner connection only)
create function private.fleet_promote_desk_owner(
  p_channel text, p_account text, p_expected_generation bigint,
  p_desk_id text, p_credential_version integer
)
returns jsonb
language sql security definer
set search_path = pg_catalog, pg_temp
as $$
  select private.fleet_change_desk_owner(private.fleet_require_owner(),
    p_channel, p_account, 'promote', p_expected_generation, p_desk_id, p_credential_version);
$$;
revoke all on function private.fleet_promote_desk_owner(text, text, bigint, text, integer)
  from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (verified database-owner connection only)
create function private.fleet_rollback_desk_owner(
  p_channel text, p_account text, p_expected_generation bigint,
  p_desk_id text, p_credential_version integer
)
returns jsonb
language sql security definer
set search_path = pg_catalog, pg_temp
as $$
  select private.fleet_change_desk_owner(private.fleet_require_owner(),
    p_channel, p_account, 'rollback', p_expected_generation, p_desk_id, p_credential_version);
$$;
revoke all on function private.fleet_rollback_desk_owner(text, text, bigint, text, integer)
  from public, anon, authenticated, service_role;

-- Every desk operation admits through this check in its action transaction.
-- The bearer, verifying key and signed claims must all name the live owner.
-- tuturuuu: no-grant (internal)
create function private.fleet_admit_desk_event(p_event jsonb, p_operation text)
returns text
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_channel text := p_event ->> 'channel';
  v_owner private.fleet_desk_owners%rowtype;
  v_reason text;
begin
  if v_channel is null or v_channel not in ('whatsapp', 'zalo', 'discord') then
    return 'unauthorized_desk_event';
  end if;

  -- Owner changes lock control before the desk row. Admission keeps that order.
  perform 1 from private.fleet_control for share;
  select * into v_owner from private.fleet_desk_owners
  where channel = v_channel and provider_account_id = p_event ->> 'account'
  for share;

  if not found or v_owner.quiesced
    or p_event -> 'version' is distinct from '2'::jsonb
    or p_event ->> 'conversationType' is distinct from 'private_1_to_1'
    or p_event ->> 'operation' is distinct from p_operation
    or p_event ->> 'bearerDeskId' is distinct from v_owner.desk_id
    or p_event ->> 'signingDeskId' is distinct from v_owner.desk_id
    or p_event -> 'signingCredentialVersion' is distinct from to_jsonb(v_owner.credential_version)
    or p_event ->> 'deskId' is distinct from v_owner.desk_id
    or p_event -> 'credentialVersion' is distinct from to_jsonb(v_owner.credential_version)
    or p_event -> 'ownerGeneration' is distinct from to_jsonb(v_owner.owner_generation::text) then
    v_reason := 'unauthorized_desk_event';
  elsif not private.fleet_consume_provider_event(p_event) then
    v_reason := 'event_replayed';
  end if;

  if v_reason is not null then
    insert into private.fleet_audit_events (channel, action, reason_code)
      values (v_channel, p_operation, v_reason);
  end if;
  return v_reason;
end;
$$;
revoke all on function private.fleet_admit_desk_event(jsonb, text)
  from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
create function private.fleet_linked_desk_actor(p_event jsonb)
returns uuid
language sql
set search_path = pg_catalog, pg_temp
as $$
  select i.user_id from private.fleet_channel_identities i
  where i.channel = p_event ->> 'channel' and i.provider_account_id = p_event ->> 'account'
    and i.sender_hash = decode(p_event ->> 'senderHash', 'hex')
    and i.private_conversation_id = p_event ->> 'conversationHash'
  for share;
$$;
revoke all on function private.fleet_linked_desk_actor(jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.fleet_verify_link_code(p_code_hash bytea, p_confirmation_hash bytea, p_event jsonb)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_pending_id uuid;
  v_reason text;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege;
  end if;
  v_reason := private.fleet_admit_desk_event(p_event, 'identity.verify');
  if v_reason is not null then
    return jsonb_build_object('reason', v_reason);
  end if;
  update private.fleet_identity_link_codes l set
    pending_id = gen_random_uuid(), confirmation_hash = p_confirmation_hash,
    channel = p_event ->> 'channel', provider_account_id = p_event ->> 'account',
    provider_account_label = (
      select d.provider_account_label from private.fleet_desk_owners d
      where d.channel = p_event ->> 'channel' and d.provider_account_id = p_event ->> 'account'
    ),
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

create or replace function private.fleet_submit_resolved_intent(
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
    v_desk_refusal := private.fleet_admit_desk_event(p_event, 'intent.submit');
    if v_desk_refusal is not null then
      return query select null::uuid, v_desk_refusal;
      return;
    end if;
    v_actor := private.fleet_linked_desk_actor(p_event);
    if v_actor is null then
      insert into private.fleet_audit_events (channel, action, reason_code)
        values (v_channel, 'intent.submit', 'unlinked_identity');
      return query select null::uuid, 'unlinked_identity'::text;
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

commit;
