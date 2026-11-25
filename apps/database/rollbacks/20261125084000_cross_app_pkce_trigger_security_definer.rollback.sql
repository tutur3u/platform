-- Restores the invoker-rights Worker-only cross-app PKCE fence.
-- Rollback of 20261125084000_cross_app_pkce_trigger_security_definer.sql.
-- Rolling back breaks user-client cross-app mints again: the deferred fence
-- runs at COMMIT as authenticated, which cannot read private.cross_app_tokens,
-- so every such mint fails with 42501.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- tuturuuu: no-grant (internal)
create or replace function private.enforce_worker_only_cross_app_pkce()
returns trigger
language plpgsql
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
