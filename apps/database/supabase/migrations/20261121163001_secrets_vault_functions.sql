-- Definers for the secrets vault storage. Server routes call them with the
-- service role after authenticating the caller and pass that caller as
-- p_actor; every actor-facing function rechecks workspace membership or own
-- keyring ownership here. Publication functions take no actor: they store a
-- transition the witness already committed and are idempotent.
begin;
set local lock_timeout = '3s';

-- Owned by the migration owner, which can read workspaces; vault_definer can
-- only call it.
-- tuturuuu: reviewed(function-grant) vault definer only
create or replace function private.vault_workspace_creator(p_ws uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select w.creator_id from public.workspaces w where w.id = p_ws;
$$;
revoke all on function private.vault_workspace_creator(uuid) from public, anon, authenticated, service_role;
grant execute on function private.vault_workspace_creator(uuid) to vault_definer;

-- tuturuuu: no-grant (internal)
create or replace function private.vault_require_member(p_ws uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_ws is null or p_actor is null or not public.is_org_member(p_actor, p_ws) then
    raise exception 'Vault access required' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.vault_require_member(uuid, uuid) from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
create or replace function private.vault_lock(p_ws uuid)
returns void
language sql
security definer
set search_path = pg_catalog, pg_temp
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('vault:' || p_ws::text, 0));
$$;
revoke all on function private.vault_lock(uuid) from public, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
create or replace function private.vault_user_of(p_actor uuid)
returns bytea
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select k.vault_user_id from private.vault_keyrings k where k.user_id = p_actor;
$$;
revoke all on function private.vault_user_of(uuid) from public, anon, authenticated, service_role;

-- tuturuuu: reviewed(function-grant) service role; membership and workspace creator rechecked inside
create or replace function private.vault_create(p_ws uuid, p_actor uuid, p_vault_id bytea, p_signed_genesis bytea)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  perform private.vault_require_member(p_ws, p_actor);
  -- Only the workspace creator roots a vault. Default and admin permissions
  -- are granted to every member of a new workspace, so they cannot decide who
  -- becomes the vault's first owner.
  if private.vault_workspace_creator(p_ws) is distinct from p_actor then
    raise exception 'Vault access required' using errcode = '42501';
  end if;
  insert into private.vault_genesis (ws_id, vault_id, signed_genesis, created_by)
  values (p_ws, p_vault_id, p_signed_genesis, p_actor);
exception
  when unique_violation then
    raise exception 'Vault already exists' using errcode = '23505';
end;
$$;
revoke all on function private.vault_create(uuid, uuid, bytea, bytea) from public, anon, authenticated, service_role;
grant execute on function private.vault_create(uuid, uuid, bytea, bytea) to service_role;

-- tuturuuu: reviewed(function-grant) service role; membership rechecked inside
create or replace function private.vault_stage(p_ws uuid, p_actor uuid, p_kind text, p_payload bytea)
returns bytea
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hash bytea := pg_catalog.sha256(p_payload);
  v_kind text;
begin
  perform private.vault_require_member(p_ws, p_actor);
  perform private.vault_lock(p_ws);
  if not exists (select 1 from private.vault_genesis g where g.ws_id = p_ws) then
    raise exception 'Vault not found' using errcode = 'P0002';
  end if;
  if (select count(*) from private.vault_staged_payloads s
      where s.ws_id = p_ws and s.expires_at > now()) >= 10000 then
    raise exception 'Too many staged payloads' using errcode = '54000';
  end if;
  select s.kind into v_kind from private.vault_staged_payloads s
  where s.ws_id = p_ws and s.payload_hash = v_hash;
  if found then
    if v_kind is distinct from p_kind then
      raise exception 'Payload staged as another kind' using errcode = '23505';
    end if;
    update private.vault_staged_payloads s
    set expires_at = now() + interval '24 hours'
    where s.ws_id = p_ws and s.payload_hash = v_hash;
    return v_hash;
  end if;
  insert into private.vault_staged_payloads (ws_id, payload_hash, kind, payload, staged_by)
  values (p_ws, v_hash, p_kind, p_payload, p_actor);
  return v_hash;
end;
$$;
revoke all on function private.vault_stage(uuid, uuid, text, bytea) from public, anon, authenticated, service_role;
grant execute on function private.vault_stage(uuid, uuid, text, bytea) to service_role;

-- tuturuuu: reviewed(function-grant) service role; publisher stores witness-committed entries only
create or replace function private.vault_publish_entry(p_ws uuid, p_seq bigint, p_entry_hash bytea, p_signed_entry bytea)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_hash bytea;
  v_entry bytea;
  v_head bigint;
begin
  perform private.vault_lock(p_ws);
  select l.entry_hash, l.signed_entry into v_hash, v_entry
  from private.vault_key_log l where l.ws_id = p_ws and l.seq = p_seq;
  if found then
    -- A republish counts as stored only when every column is identical.
    if v_hash = p_entry_hash and v_entry = p_signed_entry then
      return 'duplicate';
    end if;
    raise exception 'Key log entry conflict' using errcode = '23505';
  end if;
  select coalesce(max(l.seq), 0) into v_head from private.vault_key_log l where l.ws_id = p_ws;
  if p_seq <> v_head + 1 then
    raise exception 'Key log entries publish in order' using errcode = '22023';
  end if;
  insert into private.vault_key_log (ws_id, seq, entry_hash, signed_entry)
  values (p_ws, p_seq, p_entry_hash, p_signed_entry);
  return 'published';
end;
$$;
revoke all on function private.vault_publish_entry(uuid, bigint, bytea, bytea) from public, anon, authenticated, service_role;
grant execute on function private.vault_publish_entry(uuid, bigint, bytea, bytea) to service_role;

-- tuturuuu: reviewed(function-grant) service role; publisher stores witness-committed records only
create or replace function private.vault_publish_record(
  p_ws uuid,
  p_record_hash bytea,
  p_env text,
  p_variable_id text,
  p_version integer,
  p_signed_record bytea,
  p_ciphertext_hash bytea
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_ciphertext bytea;
  v_existing private.vault_records%rowtype;
begin
  perform private.vault_lock(p_ws);
  select * into v_existing from private.vault_records r
  where r.ws_id = p_ws and r.record_hash = p_record_hash;
  if found then
    if v_existing.env = p_env and v_existing.variable_id = p_variable_id
      and v_existing.version = p_version and v_existing.signed_record = p_signed_record
      and v_existing.ciphertext_hash is not distinct from p_ciphertext_hash then
      return 'duplicate';
    end if;
    raise exception 'Record conflict' using errcode = '23505';
  end if;
  if p_ciphertext_hash is not null then
    select s.payload into v_ciphertext
    from private.vault_staged_payloads s
    where s.ws_id = p_ws and s.payload_hash = p_ciphertext_hash and s.kind = 'ciphertext'
      and s.expires_at > now();
    if not found then
      raise exception 'Staged ciphertext missing' using errcode = 'P0002';
    end if;
  end if;
  begin
    insert into private.vault_records
      (ws_id, record_hash, env, variable_id, version, signed_record, ciphertext_hash, ciphertext)
    values
      (p_ws, p_record_hash, p_env, p_variable_id, p_version, p_signed_record, p_ciphertext_hash, v_ciphertext);
  exception
    when unique_violation then
      raise exception 'Record version conflict' using errcode = '23505';
  end;
  delete from private.vault_staged_payloads s
  where s.ws_id = p_ws and s.payload_hash = p_ciphertext_hash and s.kind = 'ciphertext';
  return 'published';
end;
$$;
revoke all on function private.vault_publish_record(uuid, bytea, text, text, integer, bytea, bytea) from public, anon, authenticated, service_role;
grant execute on function private.vault_publish_record(uuid, bytea, text, text, integer, bytea, bytea) to service_role;

-- tuturuuu: reviewed(function-grant) service role; publisher stores witness-committed wraps only
create or replace function private.vault_publish_wrap(
  p_ws uuid,
  p_env text,
  p_epoch integer,
  p_recipient_fp bytea,
  p_key_kind text,
  p_digest bytea
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_wrap bytea;
  v_existing bytea;
begin
  perform private.vault_lock(p_ws);
  select w.digest into v_existing from private.vault_wraps w
  where w.ws_id = p_ws and w.env = p_env and w.epoch = p_epoch
    and w.recipient_fp = p_recipient_fp and w.key_kind = p_key_kind;
  if found then
    if v_existing = p_digest then
      return 'duplicate';
    end if;
    raise exception 'Wrap conflict' using errcode = '23505';
  end if;
  select s.payload into v_wrap
  from private.vault_staged_payloads s
  where s.ws_id = p_ws and s.payload_hash = p_digest and s.kind = 'wrap'
    and s.expires_at > now();
  if not found then
    raise exception 'Staged wrap missing' using errcode = 'P0002';
  end if;
  insert into private.vault_wraps (ws_id, env, epoch, recipient_fp, key_kind, wrap, digest)
  values (p_ws, p_env, p_epoch, p_recipient_fp, p_key_kind, v_wrap, p_digest);
  delete from private.vault_staged_payloads s
  where s.ws_id = p_ws and s.payload_hash = p_digest and s.kind = 'wrap';
  return 'published';
end;
$$;
revoke all on function private.vault_publish_wrap(uuid, text, integer, bytea, text, bytea) from public, anon, authenticated, service_role;
grant execute on function private.vault_publish_wrap(uuid, text, integer, bytea, text, bytea) to service_role;

-- Every vault definer runs as vault_definer, never as the migration owner.
-- ALTER ... OWNER needs CREATE on the schema for the new owner, so it is
-- held only for the transfer below.
grant create on schema private to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_require_member(uuid, uuid) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_lock(uuid) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_user_of(uuid) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_create(uuid, uuid, bytea, bytea) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_stage(uuid, uuid, text, bytea) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_publish_entry(uuid, bigint, bytea, bytea) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_publish_record(uuid, bytea, text, text, integer, bytea, bytea) owner to vault_definer;
-- tuturuuu: reviewed(alter-routine-review): VAULT-DEFINER owner transfer only; created above with pinned search_path and ACL
alter function private.vault_publish_wrap(uuid, text, integer, bytea, text, bytea) owner to vault_definer;
revoke create on schema private from vault_definer;

commit;
