begin;

alter table private.fleet_intents add column dry_run_slot timestamptz;

create index fleet_consumer_candidates on private.fleet_intents
  (state desc, created_at, id)
  where not requires_owner_approval and risk <> 'high'
    and (state = 'approved' or (state = 'claimed' and dry_run_slot is not null));

create table private.fleet_consumer_progress (
  singleton boolean primary key default true check (singleton),
  claim_slot timestamptz,
  purge_slot timestamptz,
  purge_counts jsonb
);
insert into private.fleet_consumer_progress default values;
alter table private.fleet_consumer_progress enable row level security;
revoke all on private.fleet_consumer_progress from public, anon, authenticated, service_role;

alter table private.fleet_audit_events add column retention_counts jsonb;
alter table private.fleet_audit_events drop constraint fleet_audit_actor_or_desk_refusal;
alter table private.fleet_audit_events add constraint fleet_audit_actor_or_desk_refusal check (
  actor_id is not null or (channel in ('whatsapp', 'zalo', 'discord') and (
    (action = 'intent.submit' and reason_code in ('event_replayed', 'unlinked_identity'))
    or (action = 'identity.verify' and reason_code in ('event_replayed', 'invalid_link_code'))
  )) or (channel = 'web' and action = 'retention.purge' and reason_code = 'purged'
    and jsonb_typeof(retention_counts) is not distinct from 'object')
);

-- tuturuuu: no-grant (trigger)
create or replace function private.fleet_check_intent_transition()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if old.state in ('done', 'failed', 'rejected', 'expired', 'cancelled') then
    raise exception 'Terminal Fleet intents are immutable' using errcode = '23514';
  end if;
  if row(new.id, new.requester_id, new.channel, new.kind, new.payload, new.risk,
    new.action_hash, new.project_versions, new.requester_generation, new.stop_generation,
    new.requires_owner_approval, new.idempotency_key, new.created_at, new.expires_at)
    is distinct from
    row(old.id, old.requester_id, old.channel, old.kind, old.payload, old.risk,
    old.action_hash, old.project_versions, old.requester_generation, old.stop_generation,
    old.requires_owner_approval, old.idempotency_key, old.created_at, old.expires_at) then
    raise exception 'Fleet intent action is immutable' using errcode = '23514';
  end if;

  if old.dry_run_slot is not null and new.dry_run_slot is null then
    raise exception 'Fleet dry-run leases cannot dispatch' using errcode = '23514';
  end if;

  if new.state is distinct from old.state and not (case old.state
    when 'pending_approval' then new.state in ('approved', 'rejected', 'expired', 'cancelled')
    when 'approved' then new.state in ('claimed', 'expired', 'cancelled')
    when 'claimed' then new.state in ('dispatched', 'failed', 'expired', 'cancelled')
      or (new.state = 'done' and old.dry_run_slot is not null
        and new.receipt is not distinct from '{"state":"dry_run"}'::jsonb)
    when 'dispatched' then new.state in ('done', 'failed')
    else false
  end) then
    raise exception 'Invalid Fleet intent state transition' using errcode = '23514';
  end if;
  if new.state is distinct from old.state then
    if new.state in ('approved', 'claimed', 'dispatched') and v_now >= old.expires_at then
      raise exception 'Fleet intent has expired' using errcode = '23514';
    end if;
    if new.state = 'dispatched' and old.dry_run_slot is not null then
      raise exception 'Fleet dry-run leases cannot dispatch' using errcode = '23514';
    end if;
    if new.state = 'dispatched' and (
      old.lease_expires_at <= v_now or (new.lease_expires_at > v_now) is distinct from true
    ) then
      raise exception 'Fleet dispatch requires an unexpired lease' using errcode = '23514';
    end if;
    if new.state = 'expired' and v_now < old.expires_at then
      raise exception 'Fleet intent has not expired' using errcode = '23514';
    end if;
  end if;
  if old.state = 'pending_approval' and new.state = 'approved' then
    if new.approver_id is null then
      raise exception 'Fleet approval requires an approver' using errcode = '23514';
    end if;
    if old.requires_owner_approval then
      if new.approver_id is distinct from private.fleet_require_owner() then
        raise exception 'Fleet Owner access required' using errcode = '42501';
      end if;
    end if;
  end if;
  if old.state <> 'pending_approval'
    and row(new.approver_id, new.approver_generation)
      is distinct from row(old.approver_id, old.approver_generation) then
    raise exception 'Fleet intent approval is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.fleet_check_intent_transition() from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
create function private.fleet_consumer_slot()
returns timestamptz
language sql stable
set search_path = pg_catalog, pg_temp
as $$
  select date_bin(interval '15 minutes', statement_timestamp(), 'epoch'::timestamptz)
$$;
revoke all on function private.fleet_consumer_slot() from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
create function private.fleet_consumer_fence(p_generation text)
returns boolean
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  perform 1 from private.fleet_control
    where singleton and not stopped and generation::text = p_generation for share;
  return found;
end;
$$;
revoke all on function private.fleet_consumer_fence(text) from public, anon, authenticated, service_role;

create function private.fleet_consumer_status()
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege;
  end if;
  return coalesce((select jsonb_build_object('state', 'active', 'generation', generation::text)
    from private.fleet_control where singleton and not stopped), '{"state":"stopped"}'::jsonb);
end;
$$;
revoke all on function private.fleet_consumer_status() from public, anon, authenticated, service_role;
grant execute on function private.fleet_consumer_status() to service_role;

-- Hold all authorization rows through the receipt write, using the same
-- control, grant, project lock order as intent admission.
-- tuturuuu: no-grant (internal)
create function private.fleet_dry_run_refusal(p_intent private.fleet_intents, p_generation text)
returns text
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_grant private.fleet_access_grants%rowtype;
  v_project record;
  v_projects integer := 0;
  v_actors integer := 0;
  v_now timestamptz;
begin
  if p_intent.stop_generation::text is distinct from p_generation then
    return 'stale_stop';
  end if;
  if p_intent.requires_owner_approval or p_intent.risk = 'high'
    or (p_intent.approver_id is null and p_intent.kind not in ('status_question', 'comment')) then
    return 'unsupported_approval';
  end if;

  for v_grant in
    select * from private.fleet_access_grants
    where user_id in (p_intent.requester_id, p_intent.approver_id)
    order by user_id for share
  loop
    v_actors := v_actors + 1;
    if v_grant.auth_user_id is distinct from v_grant.user_id or v_grant.revoked_at is not null
      or v_grant.expires_at <= clock_timestamp()
      or (v_grant.user_id = p_intent.requester_id
        and v_grant.generation is distinct from p_intent.requester_generation)
      or (v_grant.user_id = p_intent.approver_id and (
        v_grant.generation is distinct from p_intent.approver_generation
        or not ('approve.low' = any (v_grant.capabilities))
      )) then
      return 'stale_grant';
    end if;
  end loop;
  if v_actors <> (case when p_intent.approver_id is null
    or p_intent.approver_id = p_intent.requester_id then 1 else 2 end) then
    return 'stale_grant';
  end if;

  for v_project in
    select p.key, p.target_mapping_version from private.fleet_projects p
    join private.fleet_access_grant_projects requester
      on requester.project_key = p.key and requester.user_id = p_intent.requester_id
    join private.fleet_access_grant_projects approver
      on approver.project_key = p.key
        and approver.user_id = coalesce(p_intent.approver_id, p_intent.requester_id)
    where p_intent.project_versions ? p.key
    order by p.key for share of p, requester, approver
  loop
    if p_intent.project_versions -> v_project.key is distinct from to_jsonb(v_project.target_mapping_version) then
      return 'stale_mapping';
    end if;
    v_projects := v_projects + 1;
  end loop;
  if v_projects <> (select count(*) from jsonb_object_keys(p_intent.project_versions)) then
    return 'stale_scope';
  end if;

  v_now := clock_timestamp();
  if p_intent.risk = 'medium' and exists (
    select 1 from private.fleet_intents
    where requester_id = p_intent.requester_id and kind <> 'status_question'
      and created_at > v_now - interval '24 hours'
    offset (select intents_per_day from private.fleet_access_grants
      where user_id = p_intent.requester_id)
    limit 1
  ) then
    return 'quota_exhausted';
  end if;
  v_now := clock_timestamp();
  if p_intent.expires_at <= v_now then
    return 'intent_expired';
  end if;
  if p_intent.lease_expires_at <= v_now then
    return 'lease_expired';
  end if;
  -- A grant can expire by wall clock even while its row is locked.
  if exists (select 1 from private.fleet_access_grants
    where user_id in (p_intent.requester_id, p_intent.approver_id) and expires_at <= v_now) then
    return 'stale_grant';
  end if;
  return null;
end;
$$;
revoke all on function private.fleet_dry_run_refusal(private.fleet_intents, text)
  from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
create function private.fleet_void_dry_run(p_intent private.fleet_intents, p_reason text)
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  update private.fleet_intents set state = case p_reason
    when 'intent_expired' then 'expired'::private.fleet_intent_state
    when 'lease_expired' then 'failed'::private.fleet_intent_state
    else 'cancelled'::private.fleet_intent_state end,
    receipt = jsonb_build_object('state', p_reason)
  where id = p_intent.id;

  insert into private.fleet_audit_events (actor_id, channel, action, reason_code, intent_id)
    values (p_intent.requester_id, p_intent.channel, 'consumer.void', p_reason, p_intent.id);
end;
$$;
revoke all on function private.fleet_void_dry_run(private.fleet_intents, text)
  from public, anon, authenticated, service_role;

create function private.fleet_consumer_claim(p_slot timestamptz, p_generation text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_intent private.fleet_intents%rowtype;
  v_previous_slot timestamptz;
  v_reason text;
  v_claims jsonb := '[]'::jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege;
  end if;
  if not private.fleet_consumer_fence(p_generation) then
    return '{"state":"stopped"}';
  end if;
  select claim_slot into strict v_previous_slot from private.fleet_consumer_progress for update;
  if p_slot is distinct from private.fleet_consumer_slot() or p_slot < v_previous_slot then
    return '{"state":"slot_closed"}';
  end if;

  -- Reconcile committed claims first. Never renew a lease or replay a
  -- completed receipt. A duplicate tick cannot admit another batch.
  for v_intent in
    select * from private.fleet_intents
    where not requires_owner_approval and risk <> 'high'
      and (state = 'approved' or (state = 'claimed' and dry_run_slot is not null))
      and (p_slot is distinct from v_previous_slot or dry_run_slot = p_slot)
    order by state desc, created_at, id
    limit 20 for update
  loop
    v_reason := private.fleet_dry_run_refusal(v_intent, p_generation);
    if v_reason is not null then
      perform private.fleet_void_dry_run(v_intent, v_reason);
      continue;
    end if;
    if v_intent.state = 'approved' then
      v_intent.lease_id := gen_random_uuid();
      v_intent.lease_expires_at := clock_timestamp() + interval '15 minutes';
      insert into private.fleet_audit_events (actor_id, channel, action, reason_code, intent_id)
        values (v_intent.requester_id, v_intent.channel, 'consumer.claim', 'dry_run', v_intent.id);
    end if;
    update private.fleet_intents set state = 'claimed', dry_run_slot = p_slot,
      lease_id = v_intent.lease_id, lease_expires_at = v_intent.lease_expires_at
    where id = v_intent.id and dry_run_slot is distinct from p_slot;
    v_claims := v_claims || jsonb_build_array(jsonb_build_object(
      'id', v_intent.id, 'leaseId', v_intent.lease_id, 'idempotencyKey', v_intent.idempotency_key
    ));
  end loop;

  update private.fleet_consumer_progress set claim_slot = p_slot
    where p_slot is distinct from v_previous_slot;
  return jsonb_build_object('state', 'claimed', 'claims', v_claims);
end;
$$;
revoke all on function private.fleet_consumer_claim(timestamptz, text)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_consumer_claim(timestamptz, text) to service_role;

create function private.fleet_consumer_receipt(
  p_slot timestamptz, p_generation text, p_intent_id uuid, p_lease_id uuid,
  p_idempotency_key uuid, p_state text
)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_intent private.fleet_intents%rowtype;
  v_reason text;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege;
  end if;
  if p_state is distinct from 'dry_run' then
    raise check_violation;
  end if;
  if not private.fleet_consumer_fence(p_generation) then
    return '{"state":"stopped"}';
  end if;
  if p_slot is distinct from private.fleet_consumer_slot() then
    return '{"state":"slot_closed"}';
  end if;
  select * into v_intent from private.fleet_intents where id = p_intent_id for update;
  if not found or v_intent.dry_run_slot is distinct from p_slot
    or v_intent.lease_id is distinct from p_lease_id
    or v_intent.idempotency_key is distinct from p_idempotency_key then
    return '{"state":"lease_conflict"}';
  end if;
  if v_intent.state = 'done' and v_intent.receipt ->> 'state' = 'dry_run'
    and v_intent.lease_expires_at > clock_timestamp()
    and v_intent.stop_generation::text = p_generation then
    return '{"state":"dry_run"}';
  end if;
  if v_intent.state <> 'claimed' then
    return '{"state":"lease_conflict"}';
  end if;
  v_reason := private.fleet_dry_run_refusal(v_intent, p_generation);
  if v_reason is not null then
    perform private.fleet_void_dry_run(v_intent, v_reason);
    return '{"state":"voided"}';
  end if;

  update private.fleet_intents set state = 'done', receipt = '{"state":"dry_run"}'
    where id = v_intent.id;
  insert into private.fleet_audit_events (actor_id, channel, action, reason_code, intent_id)
    values (v_intent.requester_id, v_intent.channel, 'consumer.receipt', 'dry_run', v_intent.id);
  return '{"state":"dry_run"}';
end;
$$;
revoke all on function private.fleet_consumer_receipt(timestamptz, text, uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_consumer_receipt(timestamptz, text, uuid, uuid, uuid, text)
  to service_role;

create function private.fleet_consumer_purge(p_slot timestamptz, p_generation text)
returns jsonb
language plpgsql security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_progress private.fleet_consumer_progress%rowtype;
  v_now timestamptz;
  v_quotes integer;
  v_events integer;
  v_codes integer;
  v_counts jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise insufficient_privilege;
  end if;
  if not private.fleet_consumer_fence(p_generation) then
    return '{"state":"stopped"}';
  end if;
  select * into strict v_progress from private.fleet_consumer_progress for update;
  if p_slot is distinct from private.fleet_consumer_slot() or p_slot < v_progress.purge_slot then
    return '{"state":"slot_closed"}';
  end if;
  if p_slot = v_progress.purge_slot then
    return jsonb_build_object('state', 'purged', 'counts', v_progress.purge_counts);
  end if;

  v_now := clock_timestamp();
  -- Give all three stores a share of the 1,000-row cap even with a backlog.
  with due as (
    select intent_id from private.fleet_intent_quotes where expires_at <= v_now
    order by expires_at limit 334 for update skip locked
  )
  delete from private.fleet_intent_quotes q using due where q.intent_id = due.intent_id;
  get diagnostics v_quotes = row_count;
  with due as (
    select channel, provider_account_id, event_hash from private.fleet_provider_events
    where consumed_at < v_now - interval '2160 hours'
    order by consumed_at limit 333 for update skip locked
  )
  delete from private.fleet_provider_events e using due
  where (e.channel, e.provider_account_id, e.event_hash) = (due.channel, due.provider_account_id, due.event_hash);
  get diagnostics v_events = row_count;
  with due as (
    select user_id from private.fleet_identity_link_codes where expires_at <= v_now
    order by expires_at limit 333 for update skip locked
  )
  delete from private.fleet_identity_link_codes l using due where l.user_id = due.user_id;
  get diagnostics v_codes = row_count;

  v_counts := jsonb_build_object('quotes', v_quotes, 'events', v_events, 'linkCodes', v_codes);
  update private.fleet_consumer_progress set purge_slot = p_slot, purge_counts = v_counts;
  insert into private.fleet_audit_events (channel, action, reason_code, retention_counts)
    values ('web', 'retention.purge', 'purged', v_counts);
  return jsonb_build_object('state', 'purged', 'counts', v_counts);
end;
$$;
revoke all on function private.fleet_consumer_purge(timestamptz, text)
  from public, anon, authenticated, service_role;
grant execute on function private.fleet_consumer_purge(timestamptz, text) to service_role;

-- Expiry cleanup has one bounded delete path. A late confirmation still
-- clears its pending identity fields without consuming the row.
-- tuturuuu: no-grant (internal)
create function private.fleet_clear_expired_link_identity(p_actor_id uuid)
returns void
language sql
set search_path = pg_catalog, pg_temp
as $$
  update private.fleet_identity_link_codes
  set pending_id = null, confirmation_hash = null, channel = null,
    provider_account_id = null, provider_account_label = null,
    sender_hash = null, conversation_hash = null
  where user_id = p_actor_id and pending_id is not null and expires_at <= clock_timestamp()
$$;
revoke all on function private.fleet_clear_expired_link_identity(uuid)
  from public, anon, authenticated, service_role;

create or replace function private.fleet_verify_link_code(p_code_hash bytea, p_confirmation_hash bytea, p_event jsonb)
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

create or replace function private.fleet_confirm_link_code(
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
  perform private.fleet_clear_expired_link_identity(p_actor_id);
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
    perform private.fleet_clear_expired_link_identity(p_actor_id);
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

commit;
