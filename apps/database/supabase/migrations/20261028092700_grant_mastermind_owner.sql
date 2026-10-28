-- Grants manage_mastermind to the Mastermind owner, phucvo@tuturuuu.com, in
-- the root workspace. Product rule:
-- apps/docs/platform/features/mobile-mastermind.mdx#rollout
--
-- A separate migration on purpose: 20261028092600 adds the enum value, and
-- Postgres refuses to store a value added in the same transaction, which the
-- grant RPC's INSERT would do.
--
-- The owner is resolved by email:
--   0 accounts  -> NOTICE and skip (local resets, CI pgTAP and staging lack it);
--   1 account   -> idempotent, audited private.grant_mastermind_access, which
--                  requires root workspace membership; a non-member is a
--                  NOTICE and skip, so staging cannot block the pipeline;
--   >1 accounts -> EXCEPTION, aborting this migration (fail closed).
-- Either way a NOTICE reports the root holder count, so the production
-- migration log is the read-back. Enforcement stays behind
-- MASTERMIND_REQUIRE_EXPLICIT_GRANT (default off), so a no-op locks nobody out.

CREATE OR REPLACE FUNCTION private.grant_mastermind_access_by_email(
  p_email text,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_root constant uuid := '00000000-0000-0000-0000-000000000000';
  v_email text := lower(btrim(p_email));
  v_matches integer;
  v_owner uuid;
  v_holders integer;
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'grant_mastermind_access_by_email: an email is required';
  END IF;

  SELECT count(*), min(u.id::text)::uuid
  INTO v_matches, v_owner
  FROM auth.users u
  WHERE lower(u.email) = v_email;

  IF v_matches > 1 THEN
    RAISE EXCEPTION
      'grant_mastermind_access_by_email: % accounts match %; refusing to grant',
      v_matches, v_email;
  ELSIF v_matches = 0 THEN
    RAISE NOTICE
      'grant_mastermind_access_by_email: no account matches %; skipped',
      v_email;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.ws_id = v_root
      AND wm.user_id = v_owner
  ) THEN
    RAISE NOTICE
      'grant_mastermind_access_by_email: % is not a root workspace member; skipped',
      v_email;
  ELSE
    PERFORM private.grant_mastermind_access(v_owner, p_reason);
  END IF;

  SELECT count(DISTINCT wrm.user_id)::integer
  INTO v_holders
  FROM public.workspace_role_members wrm
  JOIN public.workspace_role_permissions wrp
    ON wrp.role_id = wrm.role_id
   AND wrp.ws_id = v_root
  WHERE wrp.permission::text = 'manage_mastermind'
    AND wrp.enabled
    AND public.has_workspace_permission(
      v_root, wrm.user_id, 'manage_mastermind'
    );

  RAISE NOTICE 'manage_mastermind holders in the root workspace: %', v_holders;
  RETURN v_holders;
END;
$$;

REVOKE ALL ON FUNCTION private.grant_mastermind_access_by_email(text, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.grant_mastermind_access_by_email(text, text) IS
  'Grants manage_mastermind to the one root member matching an email (no match or a non-member skips, more than one match raises) and returns the root holder count. Database owner only.';

SELECT private.grant_mastermind_access_by_email(
  'phucvo@tuturuuu.com',
  'Mastermind owner grant, migration 20261028092700'
);
