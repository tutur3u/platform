-- Bootstrap may precede seed data. Re-run this owner-only function after seed.
-- tuturuuu: no-grant (internal)
CREATE OR REPLACE FUNCTION private.grant_mastermind_root_creator()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT creator_id INTO v_owner FROM public.workspaces
  WHERE id = '00000000-0000-0000-0000-000000000000'::uuid FOR SHARE;
  IF v_owner IS NULL OR NOT EXISTS (
    SELECT 1 FROM auth.users WHERE id = v_owner
  ) OR NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE ws_id = '00000000-0000-0000-0000-000000000000'::uuid
      AND user_id = v_owner AND type = 'MEMBER'::public.workspace_member_type
  ) THEN
    RAISE NOTICE 'Mastermind owner grant skipped: root creator is not ready';
    RETURN;
  END IF;
  PERFORM private.grant_mastermind_access(
    v_owner, 'Root workspace creator grant, migration 20261030120000'
  );
END;
$$;
REVOKE ALL ON FUNCTION private.grant_mastermind_root_creator()
  FROM PUBLIC, anon, authenticated, service_role;
SELECT private.grant_mastermind_root_creator();
