-- Capture proposals for the people registry. When the owner turns capture on
-- and records capture consent for a conversation, an observation from an
-- unknown sender in that conversation proposes a new person with a proposed
-- identity for a manager to review. Suppression from a deleted person blocks
-- it, an identity already known for the sender (proposed, confirmed or
-- rejected) is a duplicate, and nothing proposed reaches recall until a
-- manager confirms it. See apps/docs/platform/features/people-registry.mdx.
begin;
set local lock_timeout = '3s';

-- Wrapped suppression and display keys for a live responder while capture is
-- on, so the API can fence and encrypt a proposed identity. Capture off
-- returns nothing.
-- tuturuuu: reviewed(function-grant) service role; responder capture keys only while capture is on
create function private.people_machine_capture_keys(p_ws uuid, p_principal uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'purpose', k.purpose, 'version', k.version, 'wrappedKey', encode(k.wrapped_key, 'base64'),
      'current', k.retired_at is null
    ) order by k.purpose, k.version), '[]'::jsonb)
  from private.people_workspace_keys k
  where k.ws_id = p_ws and k.purpose in ('suppression', 'display')
    and (k.purpose = 'suppression' or k.retired_at is null)
    and exists (
      select 1 from private.people_principals p
      join private.people_registry_control c on c.ws_id = p.ws_id and not c.stopped and c.capture_enabled
      where p.ws_id = p_ws and p.id = p_principal and p.kind = 'responder' and p.revoked_at is null
    );
$$;
revoke all on function private.people_machine_capture_keys(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.people_machine_capture_keys(uuid, uuid) to service_role;

-- Shape of an observation's optional label and capture material. The API
-- derives the capture material: a new person ID, the sender's current lookup
-- hash, its suppression token under the current suppression key, the tokens
-- for every lookup and suppression version, and the encrypted display value.
-- tuturuuu: no-grant (internal)
create function private.people_valid_capture(p_item jsonb, p_sender_lookups jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    (not (p_item ? 'label') or (jsonb_typeof(p_item -> 'label') = 'string'
      and length(btrim(p_item ->> 'label')) between 1 and 200))
    and (not (p_item ? 'capture') or (
      jsonb_typeof(p_item -> 'capture') = 'object'
      and (p_item -> 'capture') - 'personId' - 'lookup' - 'suppression' - 'checks' - 'display' = '{}'::jsonb
      and coalesce(p_item #>> '{capture,personId}', '')
        ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and private.people_valid_lookups(jsonb_build_array(p_item #> '{capture,lookup}'))
      and p_sender_lookups @> jsonb_build_array(p_item #> '{capture,lookup}')
      and coalesce(p_item #>> '{capture,suppression,version}', '') ~ '^[1-9][0-9]{0,3}$'
      and coalesce(p_item #>> '{capture,suppression,token}', '') ~ '^[0-9a-f]{64}$'
      and (p_item #> '{capture,suppression}') - 'version' - 'token' = '{}'::jsonb
      and jsonb_typeof(p_item #> '{capture,checks}') = 'array'
      and jsonb_array_length(p_item #> '{capture,checks}') between 1 and 64
      and not exists (
        select 1 from jsonb_array_elements(p_item #> '{capture,checks}') c
        where jsonb_typeof(c) <> 'string' or c #>> '{}' !~ '^[0-9a-f]{64}$'
      )
      and (p_item #> '{capture,checks}') @> jsonb_build_array(p_item #>> '{capture,suppression,token}')
      and (jsonb_typeof(p_item #> '{capture,display}') = 'null'
        or (coalesce(p_item #>> '{capture,display}', '') ~ '^([0-9a-f]{2})+$'
          and length(p_item #>> '{capture,display}') <= 2048))
    )), false);
$$;
revoke all on function private.people_valid_capture(jsonb, jsonb) from public, anon, authenticated, service_role;

-- Proposes an unknown sender as a new person. Returns `proposed` or
-- `duplicate` after writing, or a refusal (`unknown_sender`,
-- `consent_required`, `suppressed`) before any write. Proposals for one
-- sender are serialised by a transaction lock on its lookup hash.
-- tuturuuu: no-grant (internal)
create function private.people_propose_sender(
  p_ws uuid, p_principal uuid, p_channel private.people_channel, p_account text, p_sender_lookups jsonb,
  p_conversation uuid, p_item jsonb
)
returns text
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_capture jsonb := p_item -> 'capture';
  v_person uuid;
  v_identity uuid;
  v_lookup bytea;
  v_checks bytea[];
begin
  perform 1 from private.people_registry_control c
    where c.ws_id = p_ws and c.capture_enabled and not c.stopped;
  if not found or v_capture is null or not (p_item ? 'label') then
    return 'unknown_sender';
  end if;
  if p_conversation is null or not exists (
    select 1 from private.people_consents s
    where s.ws_id = p_ws and s.conversation_id = p_conversation and s.store = 'capture' and s.state = 'granted'
      and (s.expires_at is null or s.expires_at > clock_timestamp())
  ) then
    return 'consent_required';
  end if;

  v_lookup := decode(v_capture #>> '{lookup,hash}', 'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_ws::text || ':' || p_channel::text || ':' || p_account
    || ':' || encode(v_lookup, 'hex'), 0));
  select array_agg(decode(c #>> '{}', 'hex')) into v_checks
    from jsonb_array_elements(v_capture -> 'checks') c;
  if exists (
    select 1 from private.people_suppressions s
    where s.ws_id = p_ws and s.token = any (v_checks)
  ) then
    perform private.people_audit(p_ws, null, p_principal, 'capture.propose', 'refused_suppressed', 'reply',
      p_conversation);
    return 'suppressed';
  end if;
  if exists (
    select 1 from private.people_channel_identities i
    where i.ws_id = p_ws and i.channel = p_channel and i.provider_account_id = p_account
      and (i.key_version, i.lookup_hash) in (
        select (e ->> 'version')::smallint, decode(e ->> 'hash', 'hex')
        from jsonb_array_elements(p_sender_lookups) e
      )
  ) then
    return 'duplicate';
  end if;

  insert into private.people_persons (id, ws_id, kind, label)
    values ((v_capture ->> 'personId')::uuid, p_ws, 'person', btrim(p_item ->> 'label'))
    returning id into v_person;
  insert into private.people_consents (ws_id, person_id, store, state)
    select p_ws, v_person, s, 'unknown' from unnest(enum_range(null::private.people_consent_store)) as s;
  insert into private.people_channel_identities (
    ws_id, person_id, channel, provider_account_id, lookup_hash, key_version,
    suppression_token, suppression_key_version, display_ciphertext,
    verification, link_state, basis, evidence_ref
  ) values (
    p_ws, v_person, p_channel, p_account, v_lookup, (v_capture #>> '{lookup,version}')::smallint,
    decode(v_capture #>> '{suppression,token}', 'hex'), (v_capture #>> '{suppression,version}')::smallint,
    case when jsonb_typeof(v_capture -> 'display') = 'string' then decode(v_capture ->> 'display', 'hex') end,
    'desk_observed', 'proposed', 'self_introduction', 'desk_capture'
  )
  returning id into v_identity;
  insert into private.people_conversation_members (ws_id, conversation_id, person_id, identity_id)
    values (p_ws, p_conversation, v_person, v_identity);
  perform private.people_emit_change(p_ws, v_person, null, 'update');
  perform private.people_audit(p_ws, null, p_principal, 'capture.propose', 'proposed', 'reply', p_conversation,
    array[v_person, v_identity]);
  return 'proposed';
end;
$$;
revoke all on function private.people_propose_sender(uuid, uuid, private.people_channel, text, jsonb, uuid, jsonb)
  from public, anon, authenticated, service_role;

-- Applies one write bundle. `observe_sender` records that a confirmed person
-- spoke in the conversation named by the evidence: it creates the
-- conversation row under the current lookup key when it is new, records the
-- membership, and marks an asserted identity as desk observed. It needs a
-- confirmed sender identity and a profile consent that is not denied, revoked
-- or expired. For an unknown sender it proposes a new person when capture
-- allows it, through people_propose_sender.
-- tuturuuu: reviewed(function-grant) service role; responder principal write bundle after signature, admission and evidence checks
create or replace function private.people_write_event(
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
  v_captured text;
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
      where jsonb_typeof(e) <> 'object' or e - 'type' - 'label' - 'capture' <> '{}'::jsonb
        or coalesce(e ->> 'type', '') not in ('observe_sender')
        or not private.people_valid_capture(e, p_sender_lookups)
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
  if v_admit not in ('admitted', 'event_consumed') then
    return jsonb_build_object('reason', v_admit);
  end if;
  -- A retry of the same bundle reads its receipt; any other bundle is refused.
  select r.* into v_existing from private.people_event_receipts r
    where r.ws_id = p_ws and r.channel = v_channel and r.provider_account_id = v_account
      and r.event_hash = v_event_hash;
  if found and v_existing.input_sha256 = v_input then
    perform private.people_audit(p_ws, null, p_principal, 'write.replay', 'replayed', 'reply');
    return v_existing.receipt || jsonb_build_object('replayed', true);
  elsif found or v_admit = 'event_consumed' then
    return jsonb_build_object('reason', 'event_consumed');
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
    -- Identity decisions lock the person first, so recheck the link under that
    -- lock: an identity rejected while this call waited is not observed.
    select i.* into v_identity from private.people_channel_identities i
      where v_person.id is not null and i.ws_id = p_ws and i.id = v_identity.id
        and i.person_id = v_person.id and i.link_state = 'confirmed'
      for update;
    if v_identity.id is null then
      v_person := null;
    end if;
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

  -- Checks: the whole bundle is refused before any write. An unknown sender
  -- may be proposed as a new person; that helper decides every refusal before
  -- it writes.
  if v_person.id is null then
    v_captured := private.people_propose_sender(p_ws, p_principal, v_channel, v_account, p_sender_lookups,
      v_conversation.id, p_items -> 0);
    if v_captured in ('proposed', 'duplicate') then
      v_receipt := jsonb_build_object('reason', 'ok', 'items', jsonb_build_array(jsonb_build_object(
        'type', 'observe_sender', 'result', v_captured)));
      insert into private.people_event_receipts
        (ws_id, channel, provider_account_id, event_hash, input_sha256, principal_id, receipt)
        values (p_ws, v_channel, v_account, v_event_hash, v_input, p_principal, v_receipt);
      return v_receipt;
    end if;
    v_refusal := v_captured;
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
alter function private.people_machine_capture_keys(uuid, uuid) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_valid_capture(jsonb, jsonb) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_propose_sender(uuid, uuid, private.people_channel, text, jsonb, uuid, jsonb)
  owner to people_registry_definer;
revoke create on schema private from people_registry_definer;

commit;
