-- People registry machine principals. Each principal belongs to one workspace,
-- one kind and one workload, and signs every request with an Ed25519 key. The
-- API verifies the signature; this migration admits the request atomically:
-- live principal and registry, generation, kind, a one-time nonce and a
-- per-minute limit.
begin;
set local lock_timeout = '3s';

create type private.people_principal_kind as enum ('responder', 'fleet', 'import', 'drain');

create table private.people_principals (
  id uuid not null default gen_random_uuid(),
  ws_id uuid not null references private.people_registry_control (ws_id) on delete cascade,
  kind private.people_principal_kind not null,
  label text not null check (length(btrim(label)) between 1 and 80),
  generation bigint not null default 1 check (generation > 0),
  requests_per_minute integer not null default 120 check (requests_per_minute between 1 and 6000),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (ws_id, id),
  unique (id)
);

create table private.people_principal_keys (
  principal_id uuid not null references private.people_principals (id) on delete cascade,
  kid text not null check (kid ~ '^[A-Za-z0-9_-]{8,64}$'),
  public_key bytea not null check (octet_length(public_key) = 32),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (principal_id, kid),
  unique (kid)
);

-- Nonces are kept for the whole acceptance window (5 minutes plus 30 seconds
-- of skew); one per principal can be spent once.
create table private.people_request_nonces (
  principal_id uuid not null references private.people_principals (id) on delete cascade,
  nonce bytea not null check (octet_length(nonce) between 16 and 32),
  seen_at timestamptz not null default clock_timestamp(),
  primary key (principal_id, nonce)
);
create index people_request_nonces_seen on private.people_request_nonces (seen_at);

-- Buckets are UTC minutes so every replica counts into the same row.
create table private.people_request_counters (
  principal_id uuid not null references private.people_principals (id) on delete cascade,
  minute timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (principal_id, minute)
);

-- One recall per personal session and provider event; kept at least for the
-- evidence window and written only after the freshness check passes.
create table private.people_personal_recalls (
  ws_id uuid not null references private.people_registry_control (ws_id) on delete cascade,
  session_hash bytea not null check (octet_length(session_hash) = 32),
  event_hash bytea not null check (octet_length(event_hash) = 32),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (ws_id, session_hash, event_hash)
);
create index people_personal_recalls_recorded on private.people_personal_recalls (recorded_at);

alter table private.people_principals enable row level security;
alter table private.people_principal_keys enable row level security;
alter table private.people_request_nonces enable row level security;
alter table private.people_request_counters enable row level security;
alter table private.people_personal_recalls enable row level security;
revoke all on table private.people_principals, private.people_principal_keys, private.people_request_nonces,
  private.people_request_counters, private.people_personal_recalls
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table private.people_principals, private.people_principal_keys,
  private.people_request_nonces, private.people_request_counters, private.people_personal_recalls
  to people_registry_definer;
create policy people_principals_definer on private.people_principals
  for all to people_registry_definer using (true) with check (true);
create policy people_principal_keys_definer on private.people_principal_keys
  for all to people_registry_definer using (true) with check (true);
create policy people_request_nonces_definer on private.people_request_nonces
  for all to people_registry_definer using (true) with check (true);
create policy people_request_counters_definer on private.people_request_counters
  for all to people_registry_definer using (true) with check (true);
create policy people_personal_recalls_definer on private.people_personal_recalls
  for all to people_registry_definer using (true) with check (true);

-- tuturuuu: reviewed(function-grant) service role; registry owner only, fresh sign-in checked by the API
create function private.people_register_principal(
  p_ws uuid, p_actor uuid, p_kind private.people_principal_kind, p_label text,
  p_kid text, p_public_key bytea, p_requests_per_minute integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_id uuid;
begin
  perform private.people_require_actor(p_ws, p_actor, true);
  insert into private.people_principals (ws_id, kind, label, requests_per_minute, created_by)
    values (p_ws, p_kind, btrim(p_label), coalesce(p_requests_per_minute, 120), p_actor)
    returning id into v_id;
  insert into private.people_principal_keys (principal_id, kid, public_key)
    values (v_id, p_kid, p_public_key);
  perform private.people_audit(p_ws, p_actor, null, 'principal.register', 'registered', 'manage', null, array[v_id]);
  return jsonb_build_object('reason', 'registered', 'principalId', v_id);
end;
$$;
revoke all on function private.people_register_principal(uuid, uuid, private.people_principal_kind, text, text, bytea, integer)
  from public, anon, authenticated, service_role;
grant execute on function private.people_register_principal(uuid, uuid, private.people_principal_kind, text, text, bytea, integer)
  to service_role;

-- Adds a second key for rollover or revokes one. A principal keeps at most two
-- live keys. The generation moves only when a key row actually changes, so a
-- repeated revoke does not invalidate the surviving key.
-- tuturuuu: reviewed(function-grant) service role; registry owner only
create function private.people_set_principal_key(
  p_ws uuid, p_actor uuid, p_principal uuid, p_kid text, p_public_key bytea, p_revoke boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_generation bigint;
begin
  perform private.people_require_actor(p_ws, p_actor, true);
  select p.generation into v_generation from private.people_principals p
    where p.ws_id = p_ws and p.id = p_principal and p.revoked_at is null for update;
  if not found then
    raise exception 'Principal not found' using errcode = 'P0002';
  end if;
  if p_revoke then
    update private.people_principal_keys k set revoked_at = clock_timestamp()
      where k.principal_id = p_principal and k.kid = p_kid and k.revoked_at is null;
  else
    if (select count(*) from private.people_principal_keys k
        where k.principal_id = p_principal and k.revoked_at is null) >= 2 then
      return jsonb_build_object('reason', 'too_many_keys', 'generation', v_generation);
    end if;
    insert into private.people_principal_keys (principal_id, kid, public_key)
      values (p_principal, p_kid, p_public_key)
      on conflict do nothing;
  end if;
  if not found then
    return jsonb_build_object('reason', 'unchanged', 'generation', v_generation);
  end if;
  update private.people_principals p set generation = p.generation + 1
    where p.ws_id = p_ws and p.id = p_principal;
  perform private.people_audit(p_ws, p_actor, null,
    case when p_revoke then 'principal.key_revoke' else 'principal.key_add' end, 'updated', 'manage', null,
    array[p_principal]);
  return jsonb_build_object('reason', 'updated', 'generation', v_generation + 1);
end;
$$;
revoke all on function private.people_set_principal_key(uuid, uuid, uuid, text, bytea, boolean)
  from public, anon, authenticated, service_role;
grant execute on function private.people_set_principal_key(uuid, uuid, uuid, text, bytea, boolean) to service_role;

-- tuturuuu: reviewed(function-grant) service role; registry owner only
create function private.people_revoke_principal(p_ws uuid, p_actor uuid, p_principal uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.people_require_actor(p_ws, p_actor, true);
  update private.people_principals p set revoked_at = clock_timestamp(), generation = p.generation + 1
    where p.ws_id = p_ws and p.id = p_principal and p.revoked_at is null;
  if not found then
    return jsonb_build_object('reason', 'not_found');
  end if;
  update private.people_principal_keys k set revoked_at = clock_timestamp()
    where k.principal_id = p_principal and k.revoked_at is null;
  perform private.people_audit(p_ws, p_actor, null, 'principal.revoke', 'revoked', 'manage', null, array[p_principal]);
  return jsonb_build_object('reason', 'revoked');
end;
$$;
revoke all on function private.people_revoke_principal(uuid, uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.people_revoke_principal(uuid, uuid, uuid) to service_role;

-- Returns the live public key for a kid so the API can verify the signature
-- before admission. Revoked keys, revoked principals and stopped registries
-- return nothing.
-- tuturuuu: reviewed(function-grant) service role; machine request verification
create function private.people_principal_key(p_kid text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select jsonb_build_object(
    'principalId', p.id, 'wsId', p.ws_id, 'kind', p.kind, 'generation', p.generation,
    'publicKey', encode(k.public_key, 'base64')
  )
  from private.people_principal_keys k
  join private.people_principals p on p.id = k.principal_id
  join private.people_registry_control c on c.ws_id = p.ws_id
  where k.kid = p_kid and k.revoked_at is null and p.revoked_at is null and not c.stopped;
$$;
revoke all on function private.people_principal_key(text) from public, anon, authenticated, service_role;
grant execute on function private.people_principal_key(text) to service_role;

-- Admits one signed request after the API has verified its signature over the
-- canonical bytes. The principal and control rows are share-locked together, so
-- a concurrent stop, revoke or key change is either seen or waits. A null
-- generation or an empty kind list is refused. A refusal returns a reason
-- without raising, so the spent nonce and the count commit.
-- tuturuuu: reviewed(function-grant) service role; machine request admission
create function private.people_admit_request(
  p_principal uuid, p_kid text, p_generation bigint, p_nonce bytea, p_issued_at timestamptz,
  p_kinds private.people_principal_kind[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_principal private.people_principals;
  v_now timestamptz := clock_timestamp();
  v_minute timestamptz := date_trunc('minute', clock_timestamp() at time zone 'UTC') at time zone 'UTC';
  v_count integer;
begin
  if p_issued_at is null or p_issued_at > v_now + interval '30 seconds'
    or p_issued_at < v_now - interval '5 minutes' then
    return jsonb_build_object('reason', 'stale_request');
  end if;
  if p_generation is null or p_kinds is null or cardinality(p_kinds) = 0
    or array_position(p_kinds, null) is not null then
    return jsonb_build_object('reason', 'principal_refused');
  end if;
  select p.* into v_principal from private.people_principals p
    join private.people_principal_keys k on k.principal_id = p.id and k.kid = p_kid and k.revoked_at is null
    join private.people_registry_control c on c.ws_id = p.ws_id and not c.stopped
    where p.id = p_principal and p.revoked_at is null
    for share of p, c;
  if not found or v_principal.generation is distinct from p_generation
    or not (v_principal.kind = any (p_kinds)) then
    return jsonb_build_object('reason', 'principal_refused');
  end if;

  insert into private.people_request_nonces (principal_id, nonce) values (p_principal, p_nonce)
    on conflict do nothing;
  if not found then
    return jsonb_build_object('reason', 'nonce_replayed');
  end if;
  insert into private.people_request_counters (principal_id, minute, count)
    values (p_principal, v_minute, 1)
    on conflict (principal_id, minute) do update set count = private.people_request_counters.count + 1
    returning count into v_count;
  if v_count > v_principal.requests_per_minute then
    return jsonb_build_object('reason', 'rate_limited');
  end if;
  return jsonb_build_object(
    'reason', 'admitted', 'wsId', v_principal.ws_id, 'kind', v_principal.kind, 'principalId', v_principal.id
  );
end;
$$;
revoke all on function private.people_admit_request(uuid, text, bigint, bytea, timestamptz, private.people_principal_kind[])
  from public, anon, authenticated, service_role;
grant execute on function private.people_admit_request(uuid, text, bigint, bytea, timestamptz, private.people_principal_kind[])
  to service_role;

-- Records one recall per personal session and event. A stopped registry, a
-- disabled personal-session switch or a second recall of the same event
-- returns false without writing.
-- tuturuuu: reviewed(function-grant) service role; personal-session recall
create function private.people_record_personal_recall(p_ws uuid, p_session_hash bytea, p_event_hash bytea)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform 1 from private.people_registry_control c
    where c.ws_id = p_ws and not c.stopped and c.personal_sessions_enabled
    for share;
  if not found then
    return false;
  end if;
  insert into private.people_personal_recalls (ws_id, session_hash, event_hash)
    values (p_ws, p_session_hash, p_event_hash)
    on conflict do nothing;
  return found;
end;
$$;
revoke all on function private.people_record_personal_recall(uuid, bytea, bytea)
  from public, anon, authenticated, service_role;
grant execute on function private.people_record_personal_recall(uuid, bytea, bytea) to service_role;

-- Ownership moves to the registry definer role; CREATE on the schema is needed
-- only for the transfer.
grant create on schema private to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_register_principal(uuid, uuid, private.people_principal_kind, text, text, bytea, integer)
  owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_set_principal_key(uuid, uuid, uuid, text, bytea, boolean) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_revoke_principal(uuid, uuid, uuid) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_principal_key(text) owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_admit_request(uuid, text, bigint, bytea, timestamptz, private.people_principal_kind[])
  owner to people_registry_definer;
-- tuturuuu: reviewed(alter-routine-review): transfers ownership to the NOLOGIN registry definer role; search_path is pinned in the CREATE above
alter function private.people_record_personal_recall(uuid, bytea, bytea) owner to people_registry_definer;
revoke create on schema private from people_registry_definer;

commit;
