-- People registry memory ledger. Memory content lives in the memory service;
-- each ledger row is reserved as pending with a stable custom ID before the
-- service write, settled with the service's memory ID and revision, and moved
-- through forgotten or purged only after the service confirms. Subject rows
-- are locked before ledger rows everywhere, matching deletion.
begin;
set local lock_timeout = '3s';

create type private.people_memory_kind as enum (
  'fact', 'preference', 'language', 'topic', 'decision', 'link', 'outcome', 'commitment'
);
create type private.people_work_status as enum (
  'current', 'open', 'pending', 'blocked', 'held', 'resolved', 'delivered', 'verified'
);
create type private.people_memory_state as enum (
  'pending', 'active', 'superseded', 'retained', 'forgotten', 'purged'
);

-- Ledger rows are never dropped by a cascade: a workspace, person or
-- conversation with unpurged memories cannot be removed until they are purged.
create table private.people_memory_ledger (
  id uuid not null default gen_random_uuid(),
  ws_id uuid not null references private.people_registry_control (ws_id) on delete restrict,
  person_id uuid,
  conversation_id uuid,
  kind private.people_memory_kind not null,
  work_status private.people_work_status not null default 'current',
  due_at timestamptz,
  done_at timestamptz,
  custom_id text not null check (custom_id ~ '^people\.[0-9a-f-]{36}\.[0-9a-f-]{36}$'),
  memory_id text check (length(memory_id) between 1 and 200),
  memory_revision text check (length(memory_revision) between 1 and 200),
  idempotency_key bytea not null check (octet_length(idempotency_key) = 32),
  origin_conversation_id uuid,
  audience private.people_audience not null default 'origin',
  audience_conversation_ids uuid[] not null default '{}' check (cardinality(audience_conversation_ids) <= 50),
  owner_dm boolean not null default false,
  provenance jsonb not null check (jsonb_typeof(provenance) = 'object' and octet_length(provenance::text) <= 2048),
  writer_principal uuid,
  writer_actor uuid,
  consent_version bigint not null check (consent_version > 0),
  state private.people_memory_state not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ws_id, id),
  unique (custom_id),
  unique (ws_id, idempotency_key),
  foreign key (ws_id, person_id) references private.people_persons (ws_id, id) on delete restrict,
  foreign key (ws_id, conversation_id) references private.people_conversations (ws_id, id) on delete restrict,
  foreign key (ws_id, origin_conversation_id) references private.people_conversations (ws_id, id) on delete restrict,
  check ((person_id is null) <> (conversation_id is null)),
  check ((writer_principal is null) <> (writer_actor is null)),
  check (kind = 'commitment' or (due_at is null and done_at is null)),
  check (state not in ('active', 'superseded', 'forgotten') or memory_id is not null),
  check ((audience = 'listed') = (cardinality(audience_conversation_ids) > 0))
);
create index people_memory_ledger_person on private.people_memory_ledger (ws_id, person_id, state)
  where person_id is not null;
create index people_memory_ledger_conversation on private.people_memory_ledger (ws_id, conversation_id, state)
  where conversation_id is not null;

alter table private.people_memory_ledger enable row level security;
revoke all on table private.people_memory_ledger from public, anon, authenticated, service_role;
grant select, insert, update, delete on table private.people_memory_ledger to people_registry_definer;
create policy people_memory_ledger_definer on private.people_memory_ledger
  for all to people_registry_definer using (true) with check (true);

-- Effective memory consent for a subject: granted and unexpired.
-- tuturuuu: no-grant (internal)
create function private.people_memory_consent_granted(p_ws uuid, p_person uuid, p_conversation uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from private.people_consents c
    where c.ws_id = p_ws and c.store = 'memory' and c.state = 'granted'
      and (c.expires_at is null or c.expires_at > clock_timestamp())
      and c.person_id is not distinct from p_person and c.conversation_id is not distinct from p_conversation
  );
$$;
revoke all on function private.people_memory_consent_granted(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- Authority for ledger writes: a verified manager, or a live principal of an
-- allowed kind at the generation its request was admitted under. Locks the
-- control row so a concurrent stop is seen.
-- tuturuuu: no-grant (internal)
create function private.people_ledger_writer(
  p_ws uuid, p_principal uuid, p_generation bigint, p_actor uuid, p_owner_only boolean
)
returns void
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if (p_principal is null) = (p_actor is null) then
    raise exception 'Exactly one writer is required' using errcode = '22023';
  end if;
  if p_actor is not null then
    perform private.people_require_actor(p_ws, p_actor, p_owner_only);
    return;
  end if;
  perform 1 from private.people_registry_control c
    join private.people_principals p on p.ws_id = c.ws_id
    where c.ws_id = p_ws and not c.stopped and p.id = p_principal and p.revoked_at is null
      and p.kind in ('responder', 'import') and p_generation is not null and p.generation = p_generation
      and not p_owner_only
    for share of c, p;
  if not found then
    raise exception 'People registry access required' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.people_ledger_writer(uuid, uuid, bigint, uuid, boolean)
  from public, anon, authenticated, service_role;

-- Reserves a ledger row before any memory service write. Every check runs
-- before the idempotent insert, so a replay of a pending row is rechecked
-- against current status and consent. A conversation memory needs every known
-- member active and consenting; member rows are share-locked in ID order.
-- tuturuuu: reviewed(function-grant) service role; admitted principal or verified manager
create function private.people_reserve_memory(
  p_ws uuid, p_principal uuid, p_generation bigint, p_actor uuid, p_person uuid, p_conversation uuid,
  p_kind private.people_memory_kind, p_work_status private.people_work_status, p_due_at timestamptz,
  p_idempotency_key bytea, p_origin_conversation uuid, p_provenance jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_existing private.people_memory_ledger;
  v_consent_version bigint;
  v_status private.people_subject_status;
  v_id uuid := gen_random_uuid();
  v_origin uuid := coalesce(p_origin_conversation, p_conversation);
  v_member record;
begin
  if (p_person is null) = (p_conversation is null) or p_idempotency_key is null then
    raise exception 'Invalid memory reservation' using errcode = '22023';
  end if;
  perform private.people_ledger_writer(p_ws, p_principal, p_generation, p_actor, false);

  if p_person is not null then
    select p.status, p.consent_version into v_status, v_consent_version
      from private.people_persons p where p.ws_id = p_ws and p.id = p_person for share;
  else
    select c.status, c.consent_version into v_status, v_consent_version
      from private.people_conversations c where c.ws_id = p_ws and c.id = p_conversation for share;
  end if;
  if not found then
    raise exception 'Subject not found' using errcode = 'P0002';
  end if;
  if v_status <> 'active' then
    return jsonb_build_object('reason', 'deleting');
  end if;

  -- The origin decides the audience, so it must be the conversation itself or
  -- one the person belongs to.
  if p_conversation is not null and v_origin <> p_conversation then
    return jsonb_build_object('reason', 'scope_denied');
  end if;
  if p_person is not null and v_origin is not null and not exists (
    select 1 from private.people_conversation_members m
    where m.ws_id = p_ws and m.conversation_id = v_origin and m.person_id = p_person
  ) then
    return jsonb_build_object('reason', 'scope_denied');
  end if;

  if p_conversation is not null then
    for v_member in
      select p.id, p.status from private.people_conversation_members m
      join private.people_persons p on p.ws_id = m.ws_id and p.id = m.person_id
      where m.ws_id = p_ws and m.conversation_id = p_conversation
      order by p.id
      for share of p
    loop
      if v_member.status <> 'active' or not private.people_memory_consent_granted(p_ws, v_member.id, null) then
        return jsonb_build_object('reason', 'consent_required');
      end if;
    end loop;
  end if;
  if not private.people_memory_consent_granted(p_ws, p_person, p_conversation) then
    return jsonb_build_object('reason', 'consent_required');
  end if;

  insert into private.people_memory_ledger (
    id, ws_id, person_id, conversation_id, kind, work_status, due_at, custom_id, idempotency_key,
    origin_conversation_id, audience, provenance, writer_principal, writer_actor, consent_version
  ) values (
    v_id, p_ws, p_person, p_conversation, p_kind, coalesce(p_work_status, 'current'),
    case when p_kind = 'commitment' then p_due_at end,
    format('people.%s.%s', p_ws, v_id), p_idempotency_key,
    v_origin, 'origin', coalesce(p_provenance, '{}'), p_principal, p_actor, v_consent_version
  )
  on conflict (ws_id, idempotency_key) do nothing;
  if not found then
    select * into v_existing from private.people_memory_ledger l
      where l.ws_id = p_ws and l.idempotency_key = p_idempotency_key;
    if v_existing.writer_principal is distinct from p_principal or v_existing.writer_actor is distinct from p_actor
      or v_existing.person_id is distinct from p_person or v_existing.conversation_id is distinct from p_conversation
      or v_existing.kind <> p_kind then
      return jsonb_build_object('reason', 'idempotency_conflict');
    end if;
    return jsonb_build_object('reason', 'duplicate', 'ledgerId', v_existing.id,
      'customId', v_existing.custom_id, 'state', v_existing.state);
  end if;
  perform private.people_audit(p_ws, p_actor, p_principal, 'memory.reserve', 'reserved',
    case when p_actor is null then 'reply' else 'manage' end, p_conversation,
    array_remove(array[p_person, v_id], null));
  return jsonb_build_object('reason', 'reserved', 'ledgerId', v_id, 'customId', format('people.%s.%s', p_ws, v_id));
end;
$$;
revoke all on function private.people_reserve_memory(uuid, uuid, bigint, uuid, uuid, uuid, private.people_memory_kind,
  private.people_work_status, timestamptz, bytea, uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function private.people_reserve_memory(uuid, uuid, bigint, uuid, uuid, uuid, private.people_memory_kind,
  private.people_work_status, timestamptz, bytea, uuid, jsonb) to service_role;

-- Settles a memory service outcome. The writing principal may record its own
-- write as active or retained; a manager may also supersede or forget; only
-- the owner purges. The subject is locked before the ledger row. A subject that
-- is no longer active refuses activation, so the API purges by custom ID. Once
-- set, the memory ID never changes, and supersede or forget need the current
-- revision.
-- tuturuuu: reviewed(function-grant) service role; writer principal, manager or owner
create function private.people_settle_memory(
  p_ws uuid, p_principal uuid, p_generation bigint, p_actor uuid, p_ledger uuid,
  p_state private.people_memory_state, p_memory_id text, p_memory_revision text, p_base_revision text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_row private.people_memory_ledger;
  v_status private.people_subject_status;
  v_allowed boolean;
begin
  if p_state is null or p_state = 'pending'
    or (p_principal is not null and p_state not in ('active', 'retained')) then
    raise exception 'Invalid settlement' using errcode = '22023';
  end if;
  perform private.people_ledger_writer(p_ws, p_principal, p_generation, p_actor, p_state = 'purged');
  select * into v_row from private.people_memory_ledger l where l.ws_id = p_ws and l.id = p_ledger;
  if not found then
    raise exception 'Ledger row not found' using errcode = 'P0002';
  end if;
  if p_principal is not null and v_row.writer_principal is distinct from p_principal then
    raise exception 'People registry access required' using errcode = '42501';
  end if;

  if v_row.person_id is not null then
    select p.status into v_status from private.people_persons p
      where p.ws_id = p_ws and p.id = v_row.person_id for share;
  else
    select c.status into v_status from private.people_conversations c
      where c.ws_id = p_ws and c.id = v_row.conversation_id for share;
  end if;
  select * into v_row from private.people_memory_ledger l where l.ws_id = p_ws and l.id = p_ledger for update;

  if v_status <> 'active' and p_state in ('active', 'superseded') then
    return jsonb_build_object('reason', 'deleting', 'customId', v_row.custom_id);
  end if;
  if v_row.memory_id is not null and p_memory_id is not null and p_memory_id <> v_row.memory_id then
    return jsonb_build_object('reason', 'memory_mismatch');
  end if;
  if p_state in ('superseded', 'forgotten') and v_row.memory_revision is distinct from p_base_revision then
    return jsonb_build_object('reason', 'revision_conflict', 'revision', v_row.memory_revision);
  end if;
  v_allowed := case p_state
    when 'active' then v_row.state = 'pending' and p_memory_id is not null
    when 'superseded' then v_row.state = 'active'
    when 'retained' then v_row.state in ('pending', 'active', 'superseded', 'retained')
    when 'forgotten' then v_row.state in ('active', 'superseded', 'retained') and v_row.memory_id is not null
    when 'purged' then v_row.state in ('pending', 'active', 'superseded', 'retained', 'forgotten')
    else false
  end;
  if not v_allowed then
    return jsonb_build_object('reason', 'invalid_transition', 'state', v_row.state);
  end if;
  update private.people_memory_ledger l set
    state = p_state,
    memory_id = coalesce(l.memory_id, p_memory_id),
    memory_revision = coalesce(p_memory_revision, l.memory_revision),
    updated_at = clock_timestamp()
  where l.ws_id = p_ws and l.id = p_ledger;
  perform private.people_audit(p_ws, p_actor, p_principal, 'memory.settle', p_state::text,
    case when p_actor is null then 'reply' else 'manage' end, v_row.conversation_id,
    array_remove(array[v_row.person_id, p_ledger], null));
  return jsonb_build_object('reason', 'settled', 'state', p_state);
end;
$$;
revoke all on function private.people_settle_memory(uuid, uuid, bigint, uuid, uuid, private.people_memory_state, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function private.people_settle_memory(uuid, uuid, bigint, uuid, uuid, private.people_memory_state, text, text, text)
  to service_role;

-- Lists the ledger rows a deletion must purge, pending rows included because
-- their service write may have landed.
-- tuturuuu: reviewed(function-grant) service role; registry owner only
create function private.people_deletion_ledger(p_ws uuid, p_actor uuid, p_person uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.people_require_actor(p_ws, p_actor, true);
  return coalesce((
    select jsonb_agg(jsonb_build_object('ledgerId', l.id, 'customId', l.custom_id,
      'memoryId', l.memory_id, 'state', l.state) order by l.created_at)
    from private.people_memory_ledger l
    join private.people_persons p on p.ws_id = l.ws_id and p.id = l.person_id and p.status = 'deleting'
    where l.ws_id = p_ws and l.person_id = p_person and l.state <> 'purged'
  ), '[]'::jsonb);
end;
$$;
revoke all on function private.people_deletion_ledger(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.people_deletion_ledger(uuid, uuid, uuid) to service_role;

-- Deletion finishes only after every ledger row is purged in the memory
-- service; otherwise the person stays fenced and the count is reported.
-- tuturuuu: reviewed(function-grant) service role; registry owner only
create or replace function private.people_finish_delete(p_ws uuid, p_actor uuid, p_person uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_retained bigint;
begin
  perform private.people_require_actor(p_ws, p_actor, true);
  perform 1 from private.people_persons p
    where p.ws_id = p_ws and p.id = p_person and p.status = 'deleting' for update;
  if not found then
    return jsonb_build_object('reason', 'not_deleting');
  end if;
  select count(*) into v_retained from private.people_memory_ledger l
    where l.ws_id = p_ws and l.person_id = p_person and l.state <> 'purged';
  if v_retained > 0 then
    perform private.people_audit(p_ws, p_actor, null, 'person.delete', 'retained', 'manage', null, array[p_person]);
    return jsonb_build_object('reason', 'retained', 'retained', v_retained);
  end if;

  delete from private.people_memory_ledger l where l.ws_id = p_ws and l.person_id = p_person;
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

grant create on schema private to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_memory_consent_granted(uuid, uuid, uuid) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_ledger_writer(uuid, uuid, bigint, uuid, boolean) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_reserve_memory(uuid, uuid, bigint, uuid, uuid, uuid, private.people_memory_kind,
  private.people_work_status, timestamptz, bytea, uuid, jsonb) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_settle_memory(uuid, uuid, bigint, uuid, uuid, private.people_memory_state, text, text, text)
  owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_deletion_ledger(uuid, uuid, uuid) owner to people_registry_definer;
revoke create on schema private from people_registry_definer;

commit;
