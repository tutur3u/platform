-- Restates people registry record-write routine ACLs as static statements.
-- 20261121140000 to 20261121140004 applied the same grants through DO blocks;
-- the definitions below are unchanged and keep their owner.
begin;
set local lock_timeout = '3s';

-- tuturuuu: no-grant (internal)
revoke all on function private.people_rule_value_valid(private.people_rule, jsonb) from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
revoke all on function private.people_lock_person(uuid, uuid) from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
revoke all on function private.people_bump_person(uuid, uuid, boolean) from public, anon, authenticated, service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_create_person
create or replace function private.people_create_person(
  p_ws uuid, p_actor uuid, p_kind private.people_person_kind, p_label text, p_is_owner boolean
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_id uuid;
begin
  perform private.people_require_actor(p_ws, p_actor, coalesce(p_is_owner, false));
  insert into private.people_persons (ws_id, kind, label, is_owner)
    values (p_ws, p_kind, btrim(p_label), coalesce(p_is_owner, false))
    returning id into v_id;
  insert into private.people_consents (ws_id, person_id, store, state)
    select p_ws, v_id, s, 'unknown' from unnest(enum_range(null::private.people_consent_store)) as s;
  perform private.people_audit(p_ws, p_actor, null, 'person.create', 'created', 'manage', null, array[v_id]);
  perform private.people_emit_change(p_ws, v_id, null, 'update');
  return v_id;
end;
$$;
revoke all on function private.people_create_person(uuid, uuid, private.people_person_kind, text, boolean) from public, anon, authenticated, service_role;
grant execute on function private.people_create_person(uuid, uuid, private.people_person_kind, text, boolean) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_update_person
create or replace function private.people_update_person(
  p_ws uuid, p_actor uuid, p_person uuid, p_base_version bigint, p_label text, p_kind private.people_person_kind
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_person private.people_persons;
begin
  perform private.people_require_actor(p_ws, p_actor, false);
  v_person := private.people_lock_person(p_ws, p_person);
  if p_base_version is null or v_person.version <> p_base_version then
    return jsonb_build_object('reason', 'revision_conflict', 'version', v_person.version);
  end if;
  update private.people_persons p set
    label = coalesce(btrim(p_label), p.label), kind = coalesce(p_kind, p.kind)
  where p.ws_id = p_ws and p.id = p_person;
  perform private.people_bump_person(p_ws, p_person, false);
  perform private.people_audit(p_ws, p_actor, null, 'person.update', 'updated', 'manage', null, array[p_person]);
  perform private.people_emit_change(p_ws, p_person, null, 'update');
  return jsonb_build_object('reason', 'updated', 'version', v_person.version + 1);
end;
$$;
revoke all on function private.people_update_person(uuid, uuid, uuid, bigint, text, private.people_person_kind) from public, anon, authenticated, service_role;
grant execute on function private.people_update_person(uuid, uuid, uuid, bigint, text, private.people_person_kind) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_add_identity
create or replace function private.people_add_identity(
  p_ws uuid, p_actor uuid, p_person uuid, p_channel private.people_channel, p_account text,
  p_lookup_hash bytea, p_key_version smallint, p_display_ciphertext bytea,
  p_basis private.people_link_basis, p_suppression_token bytea, p_suppression_key_version smallint,
  p_suppression_checks bytea[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_id uuid;
begin
  perform private.people_require_actor(p_ws, p_actor, false);
  perform private.people_lock_person(p_ws, p_person);
  if p_basis = 'fleet_verified' then
    raise exception 'Fleet verification is read through Fleet access' using errcode = '22023';
  end if;
  -- The adapter derives the token for every live suppression key version; the
  -- stored token must be among them so a later deletion fences this identity.
  if octet_length(p_suppression_token) is distinct from 32 or p_suppression_key_version is null
    or not (p_suppression_token = any (coalesce(p_suppression_checks, '{}'))) then
    raise exception 'Suppression coverage required' using errcode = '22023';
  end if;
  if exists (
    select 1 from private.people_suppressions s
    where s.ws_id = p_ws and s.token = any (p_suppression_checks)
  ) then
    perform private.people_audit(p_ws, p_actor, null, 'identity.add', 'refused_suppressed');
    return jsonb_build_object('reason', 'suppressed');
  end if;
  insert into private.people_channel_identities (
    ws_id, person_id, channel, provider_account_id, lookup_hash, key_version,
    suppression_token, suppression_key_version,
    display_ciphertext, verification, link_state, basis, proposed_by, decided_by, decided_at
  ) values (
    p_ws, p_person, p_channel, p_account, p_lookup_hash, p_key_version,
    p_suppression_token, p_suppression_key_version, p_display_ciphertext,
    'asserted', 'proposed', p_basis, p_actor, null, null
  )
  on conflict (ws_id, person_id, channel, provider_account_id, lookup_hash) do nothing
  returning id into v_id;
  if v_id is null then
    return jsonb_build_object('reason', 'duplicate');
  end if;
  perform private.people_bump_person(p_ws, p_person, false);
  perform private.people_audit(p_ws, p_actor, null, 'identity.add', 'proposed', 'manage', null, array[p_person, v_id]);
  perform private.people_emit_change(p_ws, p_person, null, 'update');
  return jsonb_build_object('reason', 'proposed', 'identityId', v_id);
end;
$$;
revoke all on function private.people_add_identity(uuid, uuid, uuid, private.people_channel, text, bytea, smallint, bytea, private.people_link_basis, bytea, smallint, bytea[]) from public, anon, authenticated, service_role;
grant execute on function private.people_add_identity(uuid, uuid, uuid, private.people_channel, text, bytea, smallint, bytea, private.people_link_basis, bytea, smallint, bytea[]) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_decide_identity
create or replace function private.people_decide_identity(
  p_ws uuid, p_actor uuid, p_identity uuid, p_state private.people_link_state
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_identity private.people_channel_identities;
  v_person uuid;
begin
  perform private.people_require_actor(p_ws, p_actor, false);
  if p_state not in ('confirmed', 'rejected') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  -- Lock order is control row, then person, then identity, matching every
  -- other identity writer and the deletion steps.
  select i.person_id into v_person from private.people_channel_identities i
    where i.ws_id = p_ws and i.id = p_identity;
  if not found then
    raise exception 'Identity not found' using errcode = 'P0002';
  end if;
  perform private.people_lock_person(p_ws, v_person);
  select * into v_identity from private.people_channel_identities i
    where i.ws_id = p_ws and i.id = p_identity and i.person_id = v_person for update;
  if not found then
    raise exception 'Identity not found' using errcode = 'P0002';
  end if;
  if p_state = 'confirmed' and exists (
    select 1 from private.people_suppressions s
    where s.ws_id = p_ws and s.token = v_identity.suppression_token
      and s.key_version = v_identity.suppression_key_version
  ) then
    perform private.people_audit(p_ws, p_actor, null, 'identity.decide', 'refused_suppressed');
    return jsonb_build_object('reason', 'suppressed');
  end if;
  if p_state = 'confirmed' and (v_identity.basis = 'same_name' or exists (
    select 1 from private.people_channel_identities o
    where o.ws_id = p_ws and o.link_state = 'confirmed' and o.id <> p_identity
      and o.channel = v_identity.channel and o.provider_account_id = v_identity.provider_account_id
      and o.lookup_hash = v_identity.lookup_hash
  )) then
    return jsonb_build_object('reason', 'confirmation_conflict');
  end if;
  update private.people_channel_identities i set
    link_state = p_state, decided_by = p_actor, decided_at = clock_timestamp()
  where i.ws_id = p_ws and i.id = p_identity;
  perform private.people_bump_person(p_ws, v_identity.person_id, false);
  perform private.people_audit(p_ws, p_actor, null, 'identity.decide', p_state::text, 'manage', null,
    array[v_identity.person_id, p_identity]);
  perform private.people_emit_change(p_ws, v_identity.person_id, null, 'update');
  return jsonb_build_object('reason', p_state::text);
end;
$$;
revoke all on function private.people_decide_identity(uuid, uuid, uuid, private.people_link_state) from public, anon, authenticated, service_role;
grant execute on function private.people_decide_identity(uuid, uuid, uuid, private.people_link_state) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_set_fact
create or replace function private.people_set_fact(
  p_ws uuid, p_actor uuid, p_person uuid, p_key text, p_value text, p_base_revision bigint,
  p_audience private.people_audience, p_audience_conversations uuid[], p_owner_dm boolean, p_remove boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_revision bigint;
begin
  perform private.people_require_actor(p_ws, p_actor, false);
  perform private.people_lock_person(p_ws, p_person);
  select f.revision into v_revision from private.people_facts f
    where f.ws_id = p_ws and f.person_id = p_person and f.key = p_key for update;
  if v_revision is distinct from p_base_revision then
    return jsonb_build_object('reason', 'revision_conflict', 'revision', v_revision);
  end if;
  if exists (
    select 1 from unnest(coalesce(p_audience_conversations, '{}')) a(id)
    where not exists (select 1 from private.people_conversations c where c.ws_id = p_ws and c.id = a.id)
  ) then
    raise exception 'Audience outside workspace' using errcode = '22023';
  end if;
  if p_remove then
    delete from private.people_facts f where f.ws_id = p_ws and f.person_id = p_person and f.key = p_key;
  elsif v_revision is null then
    insert into private.people_facts (
      ws_id, person_id, key, value, owner_entered, audience, audience_conversation_ids, owner_dm,
      provenance, updated_by
    ) values (
      p_ws, p_person, p_key, p_value, true, coalesce(p_audience, 'subject_conversations'),
      coalesce(p_audience_conversations, '{}'), coalesce(p_owner_dm, false),
      jsonb_build_object('source', 'manager'), p_actor
    );
  else
    update private.people_facts f set
      value = p_value, revision = f.revision + 1, owner_entered = true,
      audience = coalesce(p_audience, f.audience),
      audience_conversation_ids = coalesce(p_audience_conversations, f.audience_conversation_ids),
      owner_dm = coalesce(p_owner_dm, f.owner_dm),
      provenance = jsonb_build_object('source', 'manager'), updated_by = p_actor, updated_at = clock_timestamp()
    where f.ws_id = p_ws and f.person_id = p_person and f.key = p_key;
  end if;
  perform private.people_bump_person(p_ws, p_person, false);
  perform private.people_audit(p_ws, p_actor, null,
    case when p_remove then 'fact.remove' else 'fact.set' end, 'updated', 'manage', null, array[p_person]);
  perform private.people_emit_change(p_ws, p_person, null, 'update');
  return jsonb_build_object('reason', 'updated', 'revision', coalesce(v_revision, 0) + 1);
end;
$$;
revoke all on function private.people_set_fact(uuid, uuid, uuid, text, text, bigint, private.people_audience, uuid[], boolean, boolean) from public, anon, authenticated, service_role;
grant execute on function private.people_set_fact(uuid, uuid, uuid, text, text, bigint, private.people_audience, uuid[], boolean, boolean) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_set_rule
create or replace function private.people_set_rule(
  p_ws uuid, p_actor uuid, p_scope private.people_rule_scope, p_channel private.people_channel,
  p_person uuid, p_conversation uuid, p_rule private.people_rule, p_value jsonb,
  p_expires_at timestamptz, p_base_revision bigint, p_remove boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_rule private.people_rules;
begin
  perform private.people_require_actor(p_ws, p_actor, false);
  if not p_remove and not private.people_rule_value_valid(p_rule, p_value) then
    raise exception 'Invalid rule value' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= clock_timestamp() then
    raise exception 'Rule expiry must be in the future' using errcode = '22023';
  end if;
  if p_person is not null then
    perform private.people_lock_person(p_ws, p_person);
  end if;
  select * into v_rule from private.people_rules r
    where r.ws_id = p_ws and r.scope = p_scope and r.rule = p_rule
      and r.channel is not distinct from p_channel and r.person_id is not distinct from p_person
      and r.conversation_id is not distinct from p_conversation
    for update;
  if v_rule.revision is distinct from p_base_revision then
    return jsonb_build_object('reason', 'revision_conflict', 'revision', v_rule.revision);
  end if;
  if p_remove then
    delete from private.people_rules r where r.ws_id = p_ws and r.id = v_rule.id;
  elsif v_rule.id is null then
    insert into private.people_rules (
      ws_id, scope, channel, person_id, conversation_id, rule, value, expires_at, provenance, updated_by
    ) values (
      p_ws, p_scope, p_channel, p_person, p_conversation, p_rule, p_value, p_expires_at,
      jsonb_build_object('source', 'manager'), p_actor
    );
  else
    update private.people_rules r set
      value = p_value, expires_at = p_expires_at, revision = r.revision + 1,
      provenance = jsonb_build_object('source', 'manager'), updated_by = p_actor, updated_at = clock_timestamp()
    where r.ws_id = p_ws and r.id = v_rule.id;
  end if;
  if p_person is not null then
    perform private.people_bump_person(p_ws, p_person, false);
    perform private.people_emit_change(p_ws, p_person, null, 'update');
  elsif p_conversation is not null then
    update private.people_conversations c set version = c.version + 1
      where c.ws_id = p_ws and c.id = p_conversation;
    perform private.people_emit_change(p_ws, null, p_conversation, 'update');
  end if;
  perform private.people_audit(p_ws, p_actor, null,
    case when p_remove then 'rule.remove' else 'rule.set' end, 'updated', 'manage', p_conversation,
    array_remove(array[p_person], null));
  return jsonb_build_object('reason', 'updated', 'revision', coalesce(v_rule.revision, 0) + 1);
end;
$$;
revoke all on function private.people_set_rule(uuid, uuid, private.people_rule_scope, private.people_channel, uuid, uuid, private.people_rule, jsonb, timestamptz, bigint, boolean) from public, anon, authenticated, service_role;
grant execute on function private.people_set_rule(uuid, uuid, private.people_rule_scope, private.people_channel, uuid, uuid, private.people_rule, jsonb, timestamptz, bigint, boolean) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_set_consent
create or replace function private.people_set_consent(
  p_ws uuid, p_actor uuid, p_person uuid, p_conversation uuid, p_store private.people_consent_store,
  p_state private.people_consent_state, p_basis private.people_consent_basis, p_evidence jsonb,
  p_scope jsonb, p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_kind private.people_change_kind;
begin
  perform private.people_require_actor(p_ws, p_actor, true);
  if (p_person is null) = (p_conversation is null)
    or (p_state <> 'unknown' and p_basis is null)
    or p_basis = 'imported'
    or (p_state = 'granted' and p_basis = 'subject_given' and coalesce(p_evidence ->> 'messageRef', '') = '')
    or (p_state = 'granted' and p_basis = 'owner_attested' and length(coalesce(p_evidence ->> 'note', '')) < 3) then
    raise exception 'Invalid consent record' using errcode = '22023';
  end if;
  if p_person is not null then
    perform private.people_lock_person(p_ws, p_person);
  elsif not exists (
    select 1 from private.people_conversations c
    where c.ws_id = p_ws and c.id = p_conversation and c.status = 'active' for update
  ) then
    raise exception 'Conversation not found' using errcode = 'P0002';
  end if;

  update private.people_consents c set
    state = p_state, basis = p_basis, evidence = coalesce(p_evidence, '{}'), scope = coalesce(p_scope, '{}'),
    recorded_by = p_actor, recorded_at = clock_timestamp(), expires_at = p_expires_at
  where c.ws_id = p_ws and c.store = p_store
    and c.person_id is not distinct from p_person and c.conversation_id is not distinct from p_conversation;
  if not found then
    insert into private.people_consents (
      ws_id, person_id, conversation_id, store, state, basis, evidence, scope, recorded_by, expires_at
    ) values (
      p_ws, p_person, p_conversation, p_store, p_state, p_basis, coalesce(p_evidence, '{}'),
      coalesce(p_scope, '{}'), p_actor, p_expires_at
    );
  end if;

  v_kind := case when p_state = 'granted' then 'update' else 'revoke' end;
  if p_person is not null then
    perform private.people_bump_person(p_ws, p_person, true);
    perform private.people_emit_change(p_ws, p_person, null, v_kind);
  else
    update private.people_conversations c set version = c.version + 1, consent_version = c.consent_version + 1
      where c.ws_id = p_ws and c.id = p_conversation;
    perform private.people_emit_change(p_ws, null, p_conversation, v_kind);
  end if;
  perform private.people_audit(p_ws, p_actor, null, 'consent.set', p_state::text, 'manage', p_conversation,
    array_remove(array[p_person], null));
  return jsonb_build_object('reason', 'updated');
end;
$$;
revoke all on function private.people_set_consent(uuid, uuid, uuid, uuid, private.people_consent_store, private.people_consent_state, private.people_consent_basis, jsonb, jsonb, timestamptz) from public, anon, authenticated, service_role;
grant execute on function private.people_set_consent(uuid, uuid, uuid, uuid, private.people_consent_store, private.people_consent_state, private.people_consent_basis, jsonb, jsonb, timestamptz) to service_role;

-- tuturuuu: reviewed(function-grant) service role; actor or owner rechecked inside private.people_set_relationship
create or replace function private.people_set_relationship(
  p_ws uuid, p_actor uuid, p_from uuid, p_to uuid, p_kind private.people_relationship_kind,
  p_label text, p_confidence numeric, p_remove boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.people_require_actor(p_ws, p_actor, false);
  perform private.people_lock_person(p_ws, least(p_from, p_to));
  perform private.people_lock_person(p_ws, greatest(p_from, p_to));
  if p_remove then
    delete from private.people_relationships r
      where r.ws_id = p_ws and r.from_person_id = p_from and r.to_person_id = p_to and r.kind = p_kind;
  else
    insert into private.people_relationships (
      ws_id, from_person_id, to_person_id, kind, label, confidence, provenance, created_by
    ) values (
      p_ws, p_from, p_to, p_kind, nullif(btrim(p_label), ''), coalesce(p_confidence, 1),
      jsonb_build_object('source', 'manager'), p_actor
    )
    on conflict (ws_id, from_person_id, to_person_id, kind) do update set
      label = excluded.label, confidence = excluded.confidence, provenance = excluded.provenance;
  end if;
  perform private.people_bump_person(p_ws, p_from, false);
  perform private.people_bump_person(p_ws, p_to, false);
  perform private.people_audit(p_ws, p_actor, null,
    case when p_remove then 'relationship.remove' else 'relationship.set' end, 'updated', 'manage', null,
    array[p_from, p_to]);
  perform private.people_emit_change(p_ws, p_from, null, 'update');
  perform private.people_emit_change(p_ws, p_to, null, 'update');
  return jsonb_build_object('reason', 'updated');
end;
$$;
revoke all on function private.people_set_relationship(uuid, uuid, uuid, uuid, private.people_relationship_kind, text, numeric, boolean) from public, anon, authenticated, service_role;
grant execute on function private.people_set_relationship(uuid, uuid, uuid, uuid, private.people_relationship_kind, text, numeric, boolean) to service_role;

commit;
