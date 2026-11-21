-- People registry deletion fences and manager reads.
begin;
set local lock_timeout = '3s';

-- Step 1 of deletion: fence the person in one transaction. The person row lock
-- serialises identity writers, so the suppression tokens stored on the locked
-- identities are exactly the set to fence. Erasure without suppression is an
-- explicit, separately audited choice.
-- tuturuuu: reviewed(function-grant) service role; registry owner only
create function private.people_begin_delete(
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

-- Step 3 of deletion, after memory purge is confirmed: remove every attached
-- record and keep a content-free tombstone row.
-- tuturuuu: reviewed(function-grant) service role; actor from a verified session
create function private.people_finish_delete(p_ws uuid, p_actor uuid, p_person uuid)
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

-- tuturuuu: reviewed(function-grant) service role; registry owner only
create function private.people_lift_suppression(
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

-- tuturuuu: reviewed(function-grant) service role; actor from a verified session
create function private.people_list_persons(
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

-- tuturuuu: reviewed(function-grant) service role; actor from a verified session
create function private.people_get_person(p_ws uuid, p_actor uuid, p_person uuid)
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

-- Ownership transfer needs CREATE on the schema; it is revoked again below.
grant create on schema private to people_registry_definer;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'private.people_begin_delete(uuid, uuid, uuid, boolean)',
    'private.people_finish_delete(uuid, uuid, uuid)',
    'private.people_lift_suppression(uuid, uuid, bytea, smallint)',
    'private.people_list_persons(uuid, uuid, text, integer, uuid)',
    'private.people_get_person(uuid, uuid, uuid)'
  ] loop
    execute format('alter function %s owner to people_registry_definer', v_signature);
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$$;

revoke create on schema private from people_registry_definer;

commit;
