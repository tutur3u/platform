-- People registry recall and change feed for machine principals. The API has
-- verified the principal signature, admitted the request and verified the
-- ingress evidence; these functions recheck the principal live, bind the
-- signed provider account to the principal's workspace before the provider
-- event is consumed, and build the chat-safe snapshot under the consent
-- matrix. See apps/docs/platform/features/people-registry.mdx#machine-access.
begin;
set local lock_timeout = '3s';

-- Fleet desk accounts are internal. No tenant binding or registry operation
-- may use one; the registry reaches the Fleet desk table only through this.
-- Desk owner rows cannot be deleted, so a retired desk account stays listed.
-- tuturuuu: reviewed(function-grant) registry definer only
create function private.fleet_is_desk_account(p_channel text, p_account text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from private.fleet_desk_owners o
    where o.channel = p_channel and o.provider_account_id = p_account
  );
$$;
revoke all on function private.fleet_is_desk_account(text, text) from public, anon, authenticated, service_role;
grant execute on function private.fleet_is_desk_account(text, text) to people_registry_definer;

-- Lookup hashes the API derived under each retained key version.
-- tuturuuu: no-grant (internal)
create function private.people_valid_lookups(p_lookups jsonb)
returns boolean
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(jsonb_typeof(p_lookups) = 'array'
    and jsonb_array_length(p_lookups) between 1 and 8
    and not exists (
      select 1 from jsonb_array_elements(p_lookups) e
      where jsonb_typeof(e) <> 'object'
        or coalesce(e ->> 'version', '') !~ '^[1-9][0-9]{0,3}$'
        or coalesce(e ->> 'hash', '') !~ '^[0-9a-f]{64}$'
    ), false);
$$;
revoke all on function private.people_valid_lookups(jsonb) from public, anon, authenticated, service_role;

-- Admits one provider event for a registry operation. The binding check runs
-- before the event is consumed, so a tenant cannot spend the slot of an
-- account that is unbound, bound to another workspace or a Fleet desk. The
-- binding row is share-locked, so a concurrent removal waits for this
-- transaction. A refusal returns rather than raising, so a counted attempt
-- commits.
-- tuturuuu: no-grant (internal)
create function private.people_admit_event(p_ws uuid, p_principal uuid, p_event jsonb, p_operation text)
returns text
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
declare
  v_channel text := p_event ->> 'channel';
  v_account text := p_event ->> 'account';
begin
  if p_operation is null or p_operation not in ('registry.recall', 'registry.write')
    or v_channel is null or v_channel not in ('whatsapp', 'zalo', 'discord')
    or v_account is null or v_account !~ '^[!-~]{1,200}$'
    or coalesce(p_event ->> 'eventHash', '') !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid provider event' using errcode = '22023';
  end if;
  perform 1 from private.people_channel_bindings b
    where b.channel = v_channel::private.people_channel and b.provider_account_id = v_account
      and b.ws_id = p_ws
    for share;
  if not found or private.fleet_is_desk_account(v_channel, v_account) then
    perform private.people_audit(p_ws, null, p_principal, 'event.admit', 'refused_scope', 'reply');
    return 'scope_denied';
  end if;
  if not private.fleet_consume_registry_event(
    jsonb_build_object('channel', v_channel, 'account', v_account, 'eventHash', p_event ->> 'eventHash'),
    p_operation
  ) then
    perform private.people_audit(p_ws, null, p_principal, 'event.admit', 'refused_event_consumed', 'reply');
    return 'event_consumed';
  end if;
  return 'admitted';
end;
$$;
revoke all on function private.people_admit_event(uuid, uuid, jsonb, text) from public, anon, authenticated, service_role;

-- Wrapped lookup keys for a live responder principal, so the API can hash the
-- signed sender and conversation. Only the two lookup purposes are returned,
-- every retained version included, never the display, suppression or audit
-- keys.
-- tuturuuu: reviewed(function-grant) service role; responder principal lookup keys only
create function private.people_machine_lookup_keys(p_ws uuid, p_principal uuid)
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
  where k.ws_id = p_ws and k.purpose in ('sender_lookup', 'conversation_lookup')
    and exists (
      select 1 from private.people_principals p
      join private.people_registry_control c on c.ws_id = p.ws_id and not c.stopped
      where p.ws_id = p_ws and p.id = p_principal and p.kind = 'responder' and p.revoked_at is null
    );
$$;
revoke all on function private.people_machine_lookup_keys(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.people_machine_lookup_keys(uuid, uuid) to service_role;

-- A person whose profile store is granted and unexpired, and who is active
-- in the workspace.
-- tuturuuu: no-grant (internal)
create function private.people_profile_granted(p_ws uuid, p_person uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from private.people_consents s
    join private.people_persons p on p.ws_id = s.ws_id and p.id = s.person_id and p.status = 'active'
    where s.ws_id = p_ws and s.person_id = p_person and s.store = 'profile' and s.state = 'granted'
      and (s.expires_at is null or s.expires_at > clock_timestamp())
  );
$$;
revoke all on function private.people_profile_granted(uuid, uuid) from public, anon, authenticated, service_role;

-- A brief is usable only while every record it cites still exists in the
-- workspace and every person it can describe (the conversation's members and
-- the subjects of its cited facts and memories) keeps a granted profile.
-- Revoking one member therefore withholds a group brief that mentions them.
-- tuturuuu: no-grant (internal)
create function private.people_brief_usable(p_ws uuid, p_conversation uuid, p_cited uuid[])
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select cardinality(p_cited) = (
      select count(*) from (
        select f.id from private.people_facts f where f.ws_id = p_ws and f.id = any (p_cited)
        union
        select l.id from private.people_memory_ledger l
          where l.ws_id = p_ws and l.id = any (p_cited) and l.state = 'active'
      ) cited
    )
    and not exists (
      select 1 from (
        select m.person_id from private.people_conversation_members m
          where p_conversation is not null and m.ws_id = p_ws and m.conversation_id = p_conversation
        union
        select f.person_id from private.people_facts f where f.ws_id = p_ws and f.id = any (p_cited)
        union
        select l.person_id from private.people_memory_ledger l
          where l.ws_id = p_ws and l.id = any (p_cited) and l.person_id is not null
      ) subjects
      where not private.people_profile_granted(p_ws, subjects.person_id)
    );
$$;
revoke all on function private.people_brief_usable(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;

-- Full recall for a responder principal. The person and conversation come
-- from the ingress evidence: the API passes the lookup hashes it derived from
-- the signed sender and conversation, never a person ID. Rules always apply,
-- whatever the consent state, so a restrictive rule is never dropped. Facts,
-- relationships and briefs follow the consent matrix and fact audience: the
-- owner-entered addressing facts apply wherever the person is recalled, and
-- every other fact needs the resolved conversation to match its audience (its
-- origin, a listed conversation, or one the person takes part in: the direct
-- message with this sender or a group with a membership row). The
-- etag hashes the snapshot and versions, so `p_if_version` revalidates a cache
-- live, including rule expiry. Each recall consumes the event's recall slot
-- once; a retry for the same event is refused and the responder falls back to
-- the workspace default behaviour.
-- tuturuuu: reviewed(function-grant) service role; responder principal recall after signature, admission and evidence checks
create function private.people_recall(
  p_ws uuid, p_principal uuid, p_event jsonb, p_conversation_type text,
  p_sender_lookups jsonb, p_conversation_lookups jsonb, p_if_version text
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
  v_kind private.people_conversation_kind;
  v_control private.people_registry_control;
  v_admit text;
  v_person private.people_persons;
  v_conversation private.people_conversations;
  v_consent text;
  v_conversation_consent text;
  v_owner uuid;
  v_snapshot jsonb;
  v_versions jsonb;
  v_etag text;
begin
  if p_conversation_type is null or p_conversation_type not in ('private_1_to_1', 'group')
    or not private.people_valid_lookups(p_sender_lookups)
    or not private.people_valid_lookups(p_conversation_lookups)
    or (p_if_version is not null and p_if_version !~ '^[0-9a-f]{64}$')
    or coalesce(p_event ->> 'channel', '') not in ('whatsapp', 'zalo', 'discord') then
    raise exception 'Invalid recall' using errcode = '22023';
  end if;
  v_channel := (p_event ->> 'channel')::private.people_channel;
  v_kind := case p_conversation_type when 'group' then 'group' else 'dm' end::private.people_conversation_kind;

  select c.* into v_control from private.people_registry_control c
    join private.people_principals p on p.ws_id = c.ws_id
    where c.ws_id = p_ws and not c.stopped
      and p.id = p_principal and p.kind = 'responder' and p.revoked_at is null
    for share of c, p;
  if not found then
    return jsonb_build_object('reason', 'principal_refused');
  end if;

  v_admit := private.people_admit_event(p_ws, p_principal, p_event, 'registry.recall');
  if v_admit <> 'admitted' then
    return jsonb_build_object('reason', v_admit);
  end if;

  select p.* into v_person
    from private.people_channel_identities i
    join private.people_persons p on p.ws_id = i.ws_id and p.id = i.person_id
    where i.ws_id = p_ws and i.channel = v_channel and i.provider_account_id = v_account
      and i.link_state = 'confirmed' and p.status = 'active'
      and (i.key_version, i.lookup_hash) in (
        select (e ->> 'version')::smallint, decode(e ->> 'hash', 'hex')
        from jsonb_array_elements(p_sender_lookups) e
      )
    order by i.key_version desc
    limit 1
    for share of p;

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

  -- A missing consent row is `unknown`; a lapsed grant is `expired`.
  select case when s.state = 'granted' and s.expires_at is not null and s.expires_at <= v_now
      then 'expired' else s.state::text end
    into v_consent
    from private.people_consents s
    where v_person.id is not null and s.ws_id = p_ws and s.person_id = v_person.id and s.store = 'profile';
  v_consent := coalesce(v_consent, 'unknown');
  select case when s.state = 'granted' and s.expires_at is not null and s.expires_at <= v_now
      then 'expired' else s.state::text end
    into v_conversation_consent
    from private.people_consents s
    where v_conversation.id is not null and s.ws_id = p_ws and s.conversation_id = v_conversation.id
      and s.store = 'profile';
  v_conversation_consent := coalesce(v_conversation_consent, 'unknown');
  select p.id into v_owner from private.people_persons p
    where p.ws_id = p_ws and p.is_owner and p.status = 'active';

  v_snapshot := jsonb_build_object(
    'person', case when v_person.id is not null and v_consent = 'granted' then
      jsonb_build_object('label', v_person.label, 'kind', v_person.kind, 'isOwner', v_person.is_owner) end,
    'consent', case when v_person.id is not null then v_consent end,
    -- Under `unknown` consent only the owner-entered addressing facts apply.
    'facts', coalesce((
      select jsonb_agg(jsonb_build_object('key', f.key, 'value', f.value) order by f.key)
      from private.people_facts f
      where v_person.id is not null and f.ws_id = p_ws and f.person_id = v_person.id
        and v_consent in ('granted', 'unknown')
        and case
          when f.owner_entered and f.key in ('preferred_name', 'form_of_address', 'language') then true
          when v_consent <> 'granted' or v_conversation.id is null then false
          when f.audience = 'origin' then f.origin_conversation_id = v_conversation.id
          when f.audience = 'listed' then v_conversation.id = any (f.audience_conversation_ids)
          else v_conversation.kind = 'dm' or exists (
            select 1 from private.people_conversation_members m
            where m.ws_id = p_ws and m.conversation_id = v_conversation.id and m.person_id = v_person.id
          )
        end
    ), '[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(jsonb_build_object(
          'kind', r.kind, 'label', r.label,
          'direction', case when r.from_person_id = v_owner then 'from_owner' else 'to_owner' end
        ) order by r.kind, r.from_person_id = v_owner, r.label)
      from private.people_relationships r
      where v_consent = 'granted' and v_owner is not null and v_person.id is not null and v_person.id <> v_owner
        and r.ws_id = p_ws
        and ((r.from_person_id = v_owner and r.to_person_id = v_person.id)
          or (r.from_person_id = v_person.id and r.to_person_id = v_owner))
    ), '[]'::jsonb),
    'brief', (
      select b.body from private.people_briefs b
      where v_consent = 'granted' and b.ws_id = p_ws and b.person_id = v_person.id
        and b.consent_version = v_person.consent_version
        and private.people_brief_usable(p_ws, null, b.cited_ids)
    ),
    'conversation', case when v_conversation.id is not null then jsonb_build_object(
      'kind', v_conversation.kind,
      'brief', (
        select b.body from private.people_briefs b
        where v_conversation_consent = 'granted' and b.ws_id = p_ws and b.conversation_id = v_conversation.id
          and b.consent_version = v_conversation.consent_version
          and private.people_brief_usable(p_ws, v_conversation.id, b.cited_ids)
      )
    ) end,
    'rules', coalesce((
      select jsonb_agg(jsonb_build_object(
          'scope', r.scope, 'rule', r.rule, 'value', r.value, 'expiresAt', r.expires_at
        ) order by r.scope, r.rule)
      from private.people_rules r
      where r.ws_id = p_ws and (r.expires_at is null or r.expires_at > v_now)
        and ((r.scope = 'channel_default' and r.channel = v_channel)
          or (r.scope = 'conversation' and r.conversation_id = v_conversation.id)
          or (r.scope = 'person' and r.person_id = v_person.id))
    ), '[]'::jsonb)
  );
  v_versions := jsonb_build_object(
    'generation', v_control.generation,
    'person', case when v_person.id is not null then
      jsonb_build_object('version', v_person.version, 'consentVersion', v_person.consent_version) end,
    'conversation', case when v_conversation.id is not null then
      jsonb_build_object('version', v_conversation.version, 'consentVersion', v_conversation.consent_version) end
  );
  v_etag := encode(sha256(convert_to(jsonb_build_object(
    'personId', v_person.id, 'conversationId', v_conversation.id, 'snapshot', v_snapshot, 'versions', v_versions
  )::text, 'UTF8')), 'hex');

  perform private.people_audit(p_ws, null, p_principal, 'recall',
    case when v_person.id is null then 'miss' when v_etag = p_if_version then 'not_modified' else 'hit' end,
    'reply', v_conversation.id, array_remove(array[v_person.id], null));
  return jsonb_build_object(
    'reason', 'ok', 'personId', v_person.id, 'conversationId', v_conversation.id,
    'versions', v_versions, 'etag', v_etag
  ) || case when v_etag = p_if_version then jsonb_build_object('notModified', true)
    else jsonb_build_object('snapshot', v_snapshot) end;
end;
$$;
revoke all on function private.people_recall(uuid, uuid, jsonb, text, jsonb, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function private.people_recall(uuid, uuid, jsonb, text, jsonb, jsonb, text) to service_role;

-- Invalidation metadata for a drain principal, in workspace sequence order
-- after its cursor. The per-workspace sequence is allocated under a row lock
-- held to commit, so a cursor never passes an uncommitted event, and it
-- reveals nothing about other workspaces.
-- tuturuuu: reviewed(function-grant) service role; drain principals read invalidation metadata only
create function private.people_list_changes(p_ws uuid, p_principal uuid, p_after bigint, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_after is null or p_after < 0 or p_limit is null or p_limit not between 1 and 500 then
    raise exception 'Invalid change cursor' using errcode = '22023';
  end if;
  perform 1 from private.people_principals p
    join private.people_registry_control c on c.ws_id = p.ws_id and not c.stopped
    where p.ws_id = p_ws and p.id = p_principal and p.kind = 'drain' and p.revoked_at is null;
  if not found then
    return jsonb_build_object('reason', 'principal_refused');
  end if;
  return (
    select jsonb_build_object(
      'reason', 'ok',
      'events', coalesce(jsonb_agg(jsonb_build_object(
          'eventId', e.ws_seq, 'personId', e.person_id, 'conversationId', e.conversation_id,
          'version', e.version, 'consentVersion', e.consent_version, 'kind', e.kind
        ) order by e.ws_seq), '[]'::jsonb),
      'next', coalesce(max(e.ws_seq), p_after)
    )
    from (
      select * from private.people_change_events e
      where e.ws_id = p_ws and e.ws_seq > p_after
      order by e.ws_seq
      limit p_limit
    ) e
  );
end;
$$;
revoke all on function private.people_list_changes(uuid, uuid, bigint, integer)
  from public, anon, authenticated, service_role;
grant execute on function private.people_list_changes(uuid, uuid, bigint, integer) to service_role;

grant create on schema private to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_valid_lookups(jsonb) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_admit_event(uuid, uuid, jsonb, text) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_recall(uuid, uuid, jsonb, text, jsonb, jsonb, text) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_list_changes(uuid, uuid, bigint, integer) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_machine_lookup_keys(uuid, uuid) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_profile_granted(uuid, uuid) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_brief_usable(uuid, uuid, uuid[]) owner to people_registry_definer;
revoke create on schema private from people_registry_definer;

commit;
