-- Actor-facing reads, keyrings, unlock wraps, vault passkeys and audit for the
-- secrets vault. Server routes call them with the service role and pass the
-- authenticated caller as p_actor; each one rechecks workspace membership, the
-- workspace creator or ownership of the caller's own keyring.
begin;
set local lock_timeout = '3s';

-- tuturuuu: reviewed(function-grant) service role; membership rechecked inside
create or replace function private.vault_read_genesis(p_ws uuid, p_actor uuid)
returns table (vault_id bytea, signed_genesis bytea)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.vault_require_member(p_ws, p_actor);
  return query select g.vault_id, g.signed_genesis from private.vault_genesis g where g.ws_id = p_ws;
end;
$$;
revoke all on function private.vault_read_genesis(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function private.vault_read_genesis(uuid, uuid) to service_role;

-- tuturuuu: reviewed(function-grant) service role; membership rechecked inside
create or replace function private.vault_read_log(p_ws uuid, p_actor uuid, p_after_seq bigint, p_limit integer)
returns table (seq bigint, entry_hash bytea, signed_entry bytea)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.vault_require_member(p_ws, p_actor);
  return query
    select l.seq, l.entry_hash, l.signed_entry
    from private.vault_key_log l
    where l.ws_id = p_ws and l.seq > coalesce(p_after_seq, 0)
    order by l.seq
    limit least(greatest(coalesce(p_limit, 500), 1), 500);
end;
$$;
revoke all on function private.vault_read_log(uuid, uuid, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function private.vault_read_log(uuid, uuid, bigint, integer) to service_role;

-- tuturuuu: reviewed(function-grant) service role; membership rechecked inside
create or replace function private.vault_read_records(p_ws uuid, p_actor uuid, p_env text, p_variable_ids text[])
returns table (variable_id text, version integer, record_hash bytea, signed_record bytea, ciphertext bytea)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.vault_require_member(p_ws, p_actor);
  if p_variable_ids is null or cardinality(p_variable_ids) > 500 then
    raise exception 'Invalid variable list' using errcode = '22023';
  end if;
  return query
    select distinct on (r.variable_id)
      r.variable_id, r.version, r.record_hash, r.signed_record, r.ciphertext
    from private.vault_records r
    where r.ws_id = p_ws and r.env = p_env and r.variable_id = any (p_variable_ids)
    order by r.variable_id, r.version desc;
end;
$$;
revoke all on function private.vault_read_records(uuid, uuid, text, text[]) from public, anon, authenticated, service_role;
grant execute on function private.vault_read_records(uuid, uuid, text, text[]) to service_role;

-- tuturuuu: reviewed(function-grant) service role; membership rechecked inside
create or replace function private.vault_read_record_versions(
  p_ws uuid, p_actor uuid, p_env text, p_variable_id text, p_before_version integer, p_limit integer
)
returns table (version integer, record_hash bytea, signed_record bytea, ciphertext bytea)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.vault_require_member(p_ws, p_actor);
  return query
    select r.version, r.record_hash, r.signed_record, r.ciphertext
    from private.vault_records r
    where r.ws_id = p_ws and r.env = p_env and r.variable_id = p_variable_id
      and (p_before_version is null or r.version < p_before_version)
    order by r.version desc
    limit least(greatest(coalesce(p_limit, 20), 1), 100);
end;
$$;
revoke all on function private.vault_read_record_versions(uuid, uuid, text, text, integer, integer) from public, anon, authenticated, service_role;
grant execute on function private.vault_read_record_versions(uuid, uuid, text, text, integer, integer) to service_role;

-- tuturuuu: reviewed(function-grant) service role; membership rechecked inside
-- Newest epochs first; a caller pages older epochs with p_before_epoch.
create or replace function private.vault_read_wraps(
  p_ws uuid, p_actor uuid, p_recipient_fp bytea, p_env text, p_before_epoch integer
)
returns table (env text, epoch integer, key_kind text, wrap bytea, digest bytea)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.vault_require_member(p_ws, p_actor);
  return query
    select w.env, w.epoch, w.key_kind, w.wrap, w.digest
    from private.vault_wraps w
    where w.ws_id = p_ws and w.recipient_fp = p_recipient_fp
      and (p_env is null or w.env = p_env)
      and (p_before_epoch is null or w.epoch < p_before_epoch)
    order by w.epoch desc, w.env, w.key_kind
    limit 2000;
end;
$$;
revoke all on function private.vault_read_wraps(uuid, uuid, bytea, text, integer) from public, anon, authenticated, service_role;
grant execute on function private.vault_read_wraps(uuid, uuid, bytea, text, integer) to service_role;

-- tuturuuu: reviewed(function-grant) service role; returns only the actor's own keyring
create or replace function private.vault_get_keyring(p_actor uuid)
returns table (vault_user_id bytea, counter bigint, keyring bytea)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select k.vault_user_id, k.counter, k.keyring from private.vault_keyrings k where k.user_id = p_actor;
$$;
revoke all on function private.vault_get_keyring(uuid) from public, anon, authenticated, service_role;
grant execute on function private.vault_get_keyring(uuid) to service_role;

-- tuturuuu: reviewed(function-grant) service role; writes only the actor's own keyring by compare-and-swap
create or replace function private.vault_put_keyring(
  p_actor uuid, p_vault_user_id bytea, p_expected_counter bigint, p_keyring bytea
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_counter bigint;
begin
  if p_actor is null then
    raise exception 'Vault access required' using errcode = '42501';
  end if;
  if p_expected_counter is null then
    begin
      insert into private.vault_keyrings (vault_user_id, user_id, counter, keyring)
      values (p_vault_user_id, p_actor, 0, p_keyring);
    exception
      when unique_violation then
        raise exception 'Keyring already exists' using errcode = '23505';
    end;
    return 0;
  end if;
  update private.vault_keyrings k
  set counter = k.counter + 1, keyring = p_keyring, updated_at = now()
  where k.user_id = p_actor and k.vault_user_id = p_vault_user_id and k.counter = p_expected_counter
  returning k.counter into v_counter;
  if not found then
    raise exception 'Keyring changed' using errcode = '40001';
  end if;
  return v_counter;
end;
$$;
revoke all on function private.vault_put_keyring(uuid, bytea, bigint, bytea) from public, anon, authenticated, service_role;
grant execute on function private.vault_put_keyring(uuid, bytea, bigint, bytea) to service_role;

-- tuturuuu: reviewed(function-grant) service role; writes only the actor's own unlock wraps
create or replace function private.vault_put_unlock_wrap(
  p_actor uuid, p_method text, p_method_id bytea, p_params bytea, p_wrap bytea
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user bytea := private.vault_user_of(p_actor);
begin
  if v_user is null then
    raise exception 'Vault access required' using errcode = '42501';
  end if;
  insert into private.vault_unlock_wraps (vault_user_id, method, method_id, params, wrap)
  values (v_user, p_method, p_method_id, p_params, p_wrap)
  on conflict (vault_user_id, method, method_id)
  do update set params = excluded.params, wrap = excluded.wrap, created_at = now();
end;
$$;
revoke all on function private.vault_put_unlock_wrap(uuid, text, bytea, bytea, bytea) from public, anon, authenticated, service_role;
grant execute on function private.vault_put_unlock_wrap(uuid, text, bytea, bytea, bytea) to service_role;

-- tuturuuu: reviewed(function-grant) service role; reads only the actor's own unlock wraps
create or replace function private.vault_list_unlock_wraps(p_actor uuid)
returns table (method text, method_id bytea, params bytea, wrap bytea)
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select u.method, u.method_id, u.params, u.wrap
  from private.vault_unlock_wraps u
  where u.vault_user_id = private.vault_user_of(p_actor)
  order by u.method, u.method_id;
$$;
revoke all on function private.vault_list_unlock_wraps(uuid) from public, anon, authenticated, service_role;
grant execute on function private.vault_list_unlock_wraps(uuid) to service_role;

-- tuturuuu: reviewed(function-grant) service role; deletes only the actor's own wraps and keeps one strong method
create or replace function private.vault_delete_unlock_wrap(p_actor uuid, p_method text, p_method_id bytea)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user bytea := private.vault_user_of(p_actor);
begin
  if v_user is null then
    raise exception 'Vault access required' using errcode = '42501';
  end if;
  perform 1 from private.vault_keyrings k where k.vault_user_id = v_user for update;
  delete from private.vault_unlock_wraps u
  where u.vault_user_id = v_user and u.method = p_method and u.method_id = p_method_id;
  if not exists (
    select 1 from private.vault_unlock_wraps u
    where u.vault_user_id = v_user and u.method in ('passkey', 'recovery')
  ) then
    raise exception 'At least one passkey or recovery unlock must remain' using errcode = '23514';
  end if;
end;
$$;
revoke all on function private.vault_delete_unlock_wrap(uuid, text, bytea) from public, anon, authenticated, service_role;
grant execute on function private.vault_delete_unlock_wrap(uuid, text, bytea) to service_role;

-- tuturuuu: reviewed(function-grant) service role; registers only for the actor's own vault identity
create or replace function private.vault_register_passkey(
  p_actor uuid, p_credential_id bytea, p_public_key bytea, p_transports text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_user bytea := private.vault_user_of(p_actor);
begin
  if v_user is null then
    raise exception 'Vault access required' using errcode = '42501';
  end if;
  begin
    insert into private.vault_passkeys (credential_id, vault_user_id, public_key, transports)
    values (p_credential_id, v_user, p_public_key, coalesce(p_transports, '{}'));
  exception
    when unique_violation then
      raise exception 'Passkey already registered' using errcode = '23505';
  end;
end;
$$;
revoke all on function private.vault_register_passkey(uuid, bytea, bytea, text[]) from public, anon, authenticated, service_role;
grant execute on function private.vault_register_passkey(uuid, bytea, bytea, text[]) to service_role;

-- tuturuuu: reviewed(function-grant) service role; returns credentials of the actor's own vault identity
create or replace function private.vault_list_passkeys(p_actor uuid)
returns table (credential_id bytea, public_key bytea, sign_count bigint, transports text[])
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select p.credential_id, p.public_key, p.sign_count, p.transports
  from private.vault_passkeys p
  where p.vault_user_id = private.vault_user_of(p_actor)
  order by p.created_at;
$$;
revoke all on function private.vault_list_passkeys(uuid) from public, anon, authenticated, service_role;
grant execute on function private.vault_list_passkeys(uuid) to service_role;

-- tuturuuu: reviewed(function-grant) service role; updates only the actor's own credential
create or replace function private.vault_record_passkey_use(p_actor uuid, p_credential_id bytea, p_sign_count bigint)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_previous bigint;
begin
  select p.sign_count into v_previous
  from private.vault_passkeys p
  where p.credential_id = p_credential_id and p.vault_user_id = private.vault_user_of(p_actor)
  for update;
  if not found then
    raise exception 'Vault access required' using errcode = '42501';
  end if;
  -- Counters that stay at zero are allowed (many synced passkeys report none);
  -- once a counter is non-zero, each use must report a larger value.
  if p_sign_count is null or p_sign_count < 0 or (v_previous > 0 and p_sign_count <= v_previous)
  then
    raise exception 'Passkey counter did not advance' using errcode = '22023';
  end if;
  update private.vault_passkeys p
  set sign_count = greatest(p.sign_count, p_sign_count), last_used_at = now()
  where p.credential_id = p_credential_id;
end;
$$;
revoke all on function private.vault_record_passkey_use(uuid, bytea, bigint) from public, anon, authenticated, service_role;
grant execute on function private.vault_record_passkey_use(uuid, bytea, bigint) to service_role;

-- tuturuuu: reviewed(function-grant) service role; server-trusted audit append with a per-workspace hash chain
create or replace function private.vault_audit(
  p_ws uuid,
  p_actor_kind text,
  p_actor_id text,
  p_event text,
  p_resource jsonb,
  p_ip inet,
  p_ua_family text,
  p_grant_id text,
  p_result text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_prefix cidr;
  v_prev bytea;
  v_hash bytea;
  v_id bigint;
  v_now timestamptz := now();
begin
  perform private.vault_lock(p_ws);
  if p_ip is not null then
    v_prefix := pg_catalog.network(pg_catalog.set_masklen(p_ip, case when pg_catalog.family(p_ip) = 4 then 24 else 48 end));
  end if;
  select e.event_hash into v_prev
  from private.vault_audit_events e
  where e.ws_id = p_ws
  order by e.id desc
  limit 1;
  v_hash := pg_catalog.sha256(
    coalesce(v_prev, ''::bytea) || pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'ws', p_ws, 'actor_kind', p_actor_kind, 'actor_id', p_actor_id, 'event', p_event,
        'resource', coalesce(p_resource, '{}'::jsonb), 'ip', v_prefix, 'ua', p_ua_family,
        'grant', p_grant_id, 'result', p_result, 'at', v_now
      )::text,
      'UTF8'
    )
  );
  insert into private.vault_audit_events
    (ws_id, actor_kind, actor_id, event, resource, ip_prefix, ua_family, grant_id, result, prev_hash, event_hash, created_at)
  values
    (p_ws, p_actor_kind, p_actor_id, p_event, coalesce(p_resource, '{}'::jsonb), v_prefix, p_ua_family, p_grant_id, p_result, v_prev, v_hash, v_now)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function private.vault_audit(uuid, text, text, text, jsonb, inet, text, text, text) from public, anon, authenticated, service_role;
grant execute on function private.vault_audit(uuid, text, text, text, jsonb, inet, text, text, text) to service_role;

-- tuturuuu: reviewed(function-grant) service role; membership and workspace creator rechecked inside
create or replace function private.vault_read_audit(p_ws uuid, p_actor uuid, p_before_id bigint, p_limit integer)
returns table (
  id bigint, actor_kind text, actor_id text, event text, resource jsonb, ip_prefix cidr,
  ua_family text, grant_id text, result text, event_hash bytea, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.vault_require_member(p_ws, p_actor);
  if private.vault_workspace_creator(p_ws) is distinct from p_actor then
    raise exception 'Vault access required' using errcode = '42501';
  end if;
  return query
    select e.id, e.actor_kind, e.actor_id, e.event, e.resource, e.ip_prefix,
      e.ua_family, e.grant_id, e.result, e.event_hash, e.created_at
    from private.vault_audit_events e
    where e.ws_id = p_ws and (p_before_id is null or e.id < p_before_id)
    order by e.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;
revoke all on function private.vault_read_audit(uuid, uuid, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function private.vault_read_audit(uuid, uuid, bigint, integer) to service_role;

-- tuturuuu: reviewed(function-grant) service role; bounded expiry sweep for the Cloudflare scheduler
create or replace function private.vault_prune_staged(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_count integer;
begin
  with doomed as (
    select s.ws_id, s.payload_hash
    from private.vault_staged_payloads s
    where s.expires_at <= now()
    order by s.expires_at
    limit least(greatest(coalesce(p_limit, 1000), 1), 10000)
  )
  delete from private.vault_staged_payloads s
  using doomed d
  where s.ws_id = d.ws_id and s.payload_hash = d.payload_hash;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function private.vault_prune_staged(integer) from public, anon, authenticated, service_role;
grant execute on function private.vault_prune_staged(integer) to service_role;

-- Every vault definer runs as vault_definer, never as the migration owner.
-- ALTER ... OWNER needs CREATE on the schema for the new owner, so it is
-- held only for the transfer below.
grant create on schema private to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_read_genesis(uuid, uuid) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_read_log(uuid, uuid, bigint, integer) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_read_records(uuid, uuid, text, text[]) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_read_record_versions(uuid, uuid, text, text, integer, integer) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_read_wraps(uuid, uuid, bytea, text, integer) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_get_keyring(uuid) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_put_keyring(uuid, bytea, bigint, bytea) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_put_unlock_wrap(uuid, text, bytea, bytea, bytea) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_list_unlock_wraps(uuid) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_delete_unlock_wrap(uuid, text, bytea) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_register_passkey(uuid, bytea, bytea, text[]) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_list_passkeys(uuid) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_record_passkey_use(uuid, bytea, bigint) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_audit(uuid, text, text, text, jsonb, inet, text, text, text) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_read_audit(uuid, uuid, bigint, integer) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_prune_staged(integer) owner to vault_definer;
revoke create on schema private from vault_definer;

commit;
