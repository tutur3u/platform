-- People registry write bundles for responder principals. A provider event
-- admits at most one bundle: people_admit_event checks the account binding,
-- then takes the event's registry_write slot, which excludes the Fleet slot.
-- The outcome, accepted or refused, is stored as a receipt keyed by the event,
-- so a retry with the same input hash reads the original receipt and a
-- different bundle for a consumed event is refused. Every check runs before
-- any write, so a refused bundle writes nothing but its receipt.
-- See apps/docs/platform/features/people-registry.mdx#ingress-evidence.
begin;
set local lock_timeout = '3s';

create table private.people_event_receipts (
  ws_id uuid not null references private.people_registry_control (ws_id) on delete cascade,
  channel private.people_channel not null check (channel in ('zalo', 'whatsapp', 'discord')),
  provider_account_id text not null check (provider_account_id ~ '^[!-~]{1,200}$'),
  event_hash bytea not null check (octet_length(event_hash) = 32),
  input_sha256 bytea not null check (octet_length(input_sha256) = 32),
  principal_id uuid not null,
  receipt jsonb not null check (jsonb_typeof(receipt) = 'object' and octet_length(receipt::text) <= 4096),
  created_at timestamptz not null default clock_timestamp(),
  primary key (ws_id, channel, provider_account_id, event_hash)
);
create index people_event_receipts_created on private.people_event_receipts (created_at);
alter table private.people_event_receipts enable row level security;
revoke all on table private.people_event_receipts from public, anon, authenticated, service_role;
grant select, insert, update, delete on table private.people_event_receipts to people_registry_definer;
create policy people_event_receipts_definer on private.people_event_receipts
  for all to people_registry_definer using (true) with check (true);

-- Applies one write bundle. `observe_sender` records that a confirmed person
-- spoke in the conversation named by the evidence: it creates the
-- conversation row under the current lookup key when it is new, records the
-- membership, and marks an asserted identity as desk observed. It needs a
-- confirmed sender identity and a profile consent that is not denied, revoked
-- or expired.
-- tuturuuu: reviewed(function-grant) service role; responder principal write bundle after signature, admission and evidence checks
create function private.people_write_event(
  p_ws uuid, p_principal uuid, p_event jsonb, p_input_sha256 text, p_conversation_type text,
  p_sender_lookups jsonb, p_conversation_lookups jsonb, p_conversation_current jsonb, p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_channel private.people_channel;
  v_account text := p_event ->> 'account';
  v_event_hash bytea;
  v_input bytea;
  v_kind private.people_conversation_kind;
  v_admit text;
  v_existing private.people_event_receipts;
  v_identity private.people_channel_identities;
  v_person private.people_persons;
  v_conversation private.people_conversations;
  v_consent text;
  v_refusal text;
  v_items jsonb := '[]'::jsonb;
  v_receipt jsonb;
  v_inserted boolean;
  v_new_conversation boolean := false;
  v_observed boolean := false;
begin
  if p_conversation_type is null or p_conversation_type not in ('private_1_to_1', 'group')
    or coalesce(p_input_sha256, '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_event ->> 'channel', '') not in ('whatsapp', 'zalo', 'discord')
    or coalesce(p_event ->> 'eventHash', '') !~ '^[0-9a-f]{64}$'
    or not private.people_valid_lookups(p_sender_lookups)
    or not private.people_valid_lookups(p_conversation_lookups)
    or not private.people_valid_lookups(jsonb_build_array(p_conversation_current))
    or not p_conversation_lookups @> jsonb_build_array(p_conversation_current)
    or jsonb_typeof(p_items) is distinct from 'array'
    or jsonb_array_length(p_items) <> 1
    or (select count(distinct e ->> 'type') from jsonb_array_elements(p_items) e) <> jsonb_array_length(p_items)
    or exists (
      select 1 from jsonb_array_elements(p_items) e
      where jsonb_typeof(e) <> 'object' or e - 'type' <> '{}'::jsonb
        or coalesce(e ->> 'type', '') not in ('observe_sender')
    ) then
    raise exception 'Invalid write bundle' using errcode = '22023';
  end if;
  v_channel := (p_event ->> 'channel')::private.people_channel;
  v_event_hash := decode(p_event ->> 'eventHash', 'hex');
  v_input := decode(p_input_sha256, 'hex');
  v_kind := case p_conversation_type when 'group' then 'group' else 'dm' end::private.people_conversation_kind;

  perform 1 from private.people_registry_control c
    join private.people_principals p on p.ws_id = c.ws_id
    where c.ws_id = p_ws and not c.stopped
      and p.id = p_principal and p.kind = 'responder' and p.revoked_at is null
    for share of c, p;
  if not found then
    return jsonb_build_object('reason', 'principal_refused');
  end if;

  v_admit := private.people_admit_event(p_ws, p_principal, p_event, 'registry.write');
  if v_admit = 'event_consumed' then
    -- A retry of the same bundle reads its receipt; any other bundle is refused.
    select r.* into v_existing from private.people_event_receipts r
      where r.ws_id = p_ws and r.channel = v_channel and r.provider_account_id = v_account
        and r.event_hash = v_event_hash;
    if found and v_existing.input_sha256 = v_input then
      perform private.people_audit(p_ws, null, p_principal, 'write.replay', 'replayed', 'reply');
      return v_existing.receipt || jsonb_build_object('replayed', true);
    end if;
    return jsonb_build_object('reason', 'event_consumed');
  elsif v_admit <> 'admitted' then
    return jsonb_build_object('reason', v_admit);
  end if;

  select i.* into v_identity
    from private.people_channel_identities i
    join private.people_persons p on p.ws_id = i.ws_id and p.id = i.person_id and p.status = 'active'
    where i.ws_id = p_ws and i.channel = v_channel and i.provider_account_id = v_account
      and i.link_state = 'confirmed'
      and (i.key_version, i.lookup_hash) in (
        select (e ->> 'version')::smallint, decode(e ->> 'hash', 'hex')
        from jsonb_array_elements(p_sender_lookups) e
      )
    order by i.key_version desc
    limit 1;
  if v_identity.id is not null then
    select p.* into v_person from private.people_persons p
      where p.ws_id = p_ws and p.id = v_identity.person_id and p.status = 'active'
      for update;
  end if;
  select c.* into v_conversation
    from private.people_conversations c
    where c.ws_id = p_ws and c.channel = v_channel and c.provider_account_id = v_account
      and c.kind = v_kind and c.status = 'active'
      and (c.key_version, c.lookup_hash) in (
        select (e ->> 'version')::smallint, decode(e ->> 'hash', 'hex')
        from jsonb_array_elements(p_conversation_lookups) e
      )
    order by c.key_version desc
    limit 1
    for share;
  select case when s.state = 'granted' and s.expires_at is not null and s.expires_at <= v_now
      then 'expired' else s.state::text end
    into v_consent
    from private.people_consents s
    where v_person.id is not null and s.ws_id = p_ws and s.person_id = v_person.id and s.store = 'profile';
  v_consent := coalesce(v_consent, 'unknown');

  -- Checks: the whole bundle is refused before any write.
  if v_person.id is null then
    v_refusal := 'unknown_sender';
  elsif v_consent in ('denied', 'revoked', 'expired') then
    v_refusal := 'consent_required';
  elsif v_conversation.id is null then
    -- A conversation row that did not resolve is being deleted or has the other kind.
    select case when c.status <> 'active' then 'deleting' else 'scope_denied' end into v_refusal
      from private.people_conversations c
      where c.ws_id = p_ws and c.channel = v_channel and c.provider_account_id = v_account
        and c.lookup_hash = decode(p_conversation_current ->> 'hash', 'hex');
  end if;
  if v_refusal is not null then
    v_receipt := jsonb_build_object('reason', v_refusal);
    insert into private.people_event_receipts
      (ws_id, channel, provider_account_id, event_hash, input_sha256, principal_id, receipt)
      values (p_ws, v_channel, v_account, v_event_hash, v_input, p_principal, v_receipt);
    perform private.people_audit(p_ws, null, p_principal, 'write.bundle', 'refused_' || v_refusal, 'reply',
      v_conversation.id, array_remove(array[v_person.id], null));
    return v_receipt;
  end if;

  -- Writes.
  if v_conversation.id is null then
    insert into private.people_conversations (ws_id, channel, provider_account_id, lookup_hash, key_version, kind)
      values (p_ws, v_channel, v_account, decode(p_conversation_current ->> 'hash', 'hex'),
        (p_conversation_current ->> 'version')::smallint, v_kind)
      returning * into v_conversation;
    v_new_conversation := true;
  end if;
  insert into private.people_conversation_members as m (ws_id, conversation_id, person_id, identity_id)
    values (p_ws, v_conversation.id, v_person.id, v_identity.id)
    on conflict (ws_id, conversation_id, person_id) do update
      set last_seen_at = clock_timestamp(), identity_id = excluded.identity_id
    returning (m.xmax = 0) into v_inserted;
  update private.people_channel_identities i set verification = 'desk_observed'
    where i.ws_id = p_ws and i.id = v_identity.id and i.verification = 'asserted';
  v_observed := found;
  if v_observed or v_inserted then
    perform private.people_bump_person(p_ws, v_person.id, false);
    perform private.people_emit_change(p_ws, v_person.id, null, 'update');
  end if;
  if v_new_conversation then
    perform private.people_emit_change(p_ws, null, v_conversation.id, 'update');
  end if;
  v_items := jsonb_build_array(jsonb_build_object(
    'type', 'observe_sender', 'result', case when v_inserted or v_observed then 'created' else 'duplicate' end
  ));

  v_receipt := jsonb_build_object('reason', 'ok', 'items', v_items);
  insert into private.people_event_receipts
    (ws_id, channel, provider_account_id, event_hash, input_sha256, principal_id, receipt)
    values (p_ws, v_channel, v_account, v_event_hash, v_input, p_principal, v_receipt);
  perform private.people_audit(p_ws, null, p_principal, 'write.bundle', 'accepted', 'reply',
    v_conversation.id, array[v_person.id]);
  return v_receipt;
end;
$$;
revoke all on function private.people_write_event(uuid, uuid, jsonb, text, text, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function private.people_write_event(uuid, uuid, jsonb, text, text, jsonb, jsonb, jsonb, jsonb)
  to service_role;

grant create on schema private to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_write_event(uuid, uuid, jsonb, text, text, jsonb, jsonb, jsonb, jsonb)
  owner to people_registry_definer;
revoke create on schema private from people_registry_definer;

commit;
