-- Run the Worker-only cross-app PKCE fence as its definer.
-- enforce_worker_only_cross_app_pkce() is a deferred constraint trigger
-- function on private.cross_app_tokens. A deferred trigger fires at COMMIT,
-- after the security definer mint RPC (generate_cross_app_token,
-- generate_cross_app_token_pkce) has returned, so it runs as the session role.
-- For a PostgREST mint that role is authenticated, which has no USAGE on
-- schema private: the fence's read of private.cross_app_tokens fails with
-- 42501 and the whole mint transaction rolls back, so every user-client
-- cross-app handoff fails.
-- As security definer the fence reads the row as its owner whatever role
-- commits, and still refuses an unbound Worker-only mint with its own
-- message. EXECUTE stays revoked from public, anon and authenticated;
-- a trigger function needs no EXECUTE grant to fire.
-- Production received the equivalent
-- `alter function private.enforce_worker_only_cross_app_pkce() security definer`
-- on 2026-11-25. create or replace keeps the trigger binding, owner and ACL,
-- so this migration is idempotent there.
-- Rollback: apps/database/rollbacks/20261125084000_cross_app_pkce_trigger_security_definer.rollback.sql

set lock_timeout = '5s';
set statement_timeout = '60s';

-- tuturuuu: no-grant (internal)
create or replace function private.enforce_worker_only_cross_app_pkce()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_target text;
  v_challenge text;
begin
  select t.target_app, t.code_challenge
  into v_target, v_challenge
  from private.cross_app_tokens t
  where t.id = new.id;

  -- Deleted later in the same transaction: nothing to fence.
  if not found then
    return null;
  end if;

  if lower(btrim(v_target)) = any (private.cross_app_worker_only_target_names())
    and v_challenge is null
  then
    raise exception 'Worker-only cross-app targets require a PKCE challenge'
      using errcode = '42501';
  end if;

  return null;
end;
$$;

revoke all on function private.enforce_worker_only_cross_app_pkce()
  from public, anon, authenticated;
