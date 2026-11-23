-- Require a PKCE challenge on every cross-app handoff minted for a
-- Worker-only redemption target (mastermind).
-- The authenticated mint RPCs (generate_cross_app_token, both overloads, and
-- the null-challenge fallback of generate_cross_app_token_pkce) still accept
-- such a target without a challenge. Web refuses those mints in
-- packages/auth/src/cross-app/generate-server.ts, but a signed-in client can
-- call the RPCs directly and the anonymous validator would then consume the
-- token and read its identity payload. This fence holds at the table, so it
-- covers every current and future mint path.
-- The target list mirrors WORKER_ONLY_REDEEM_TARGETS in
-- packages/auth/src/app-redeem-proof.ts.
-- The check is a deferred constraint trigger because the PKCE mint inserts
-- the row and stores its challenge in a second statement of the same
-- transaction; the trigger re-reads the row by id when the check runs.
-- A transaction that writes this table and then alters it must first run
-- the queued checks (set constraints all immediate): ALTER TABLE refuses a
-- table with pending trigger events.
-- The trigger function runs as the inserting role: the mint RPCs are
-- security definer, and service_role owns direct table writes.
-- Rollback: apps/database/rollbacks/20261124064800_require_pkce_for_worker_only_cross_app_targets.rollback.sql

set lock_timeout = '5s';
set statement_timeout = '60s';

-- tuturuuu: no-grant (internal)
create or replace function private.cross_app_worker_only_target_names()
returns text[]
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select array['mastermind']::text[]
$$;

revoke all on function private.cross_app_worker_only_target_names()
  from public, anon, authenticated;

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

drop trigger if exists enforce_worker_only_cross_app_pkce
  on private.cross_app_tokens;

create constraint trigger enforce_worker_only_cross_app_pkce
after insert or update of target_app, code_challenge
on private.cross_app_tokens
deferrable initially deferred
for each row
execute function private.enforce_worker_only_cross_app_pkce();
