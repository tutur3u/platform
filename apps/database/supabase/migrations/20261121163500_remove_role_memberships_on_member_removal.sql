-- A workspace's role memberships end with its membership.
--
-- Removing a user from workspace_members (or moving the row to another
-- workspace or user) deletes their workspace_role_members rows for that
-- workspace's roles in the same statement, whichever path removes them: the
-- members API, an RPC or direct SQL. A removed member who is invited again
-- starts with no roles, so a role such as "Workspace Admin (preserved)" is not
-- regained silently. Policies that check role membership alone also stop
-- admitting removed users. Existing leftover rows are deleted once below.

-- tuturuuu: no-grant (trigger)
CREATE FUNCTION private.remove_departed_member_role_memberships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  -- Ending the recorded Mastermind role membership is a revoke, so it joins
  -- the grant/revoke ledger alongside private.revoke_mastermind_access.
  WITH removed AS (
    DELETE FROM public.workspace_role_members wrm
    USING public.workspace_roles wr
    WHERE wr.id = wrm.role_id
      AND wr.ws_id = OLD.ws_id
      AND wrm.user_id = OLD.user_id
    RETURNING wrm.role_id, wrm.user_id
  )
  INSERT INTO private.mastermind_access_audit
    (action, target_user_id, role_id, changed, reason)
  SELECT 'revoke', removed.user_id, removed.role_id, true,
    'Root workspace membership ended'
  FROM removed
  JOIN private.mastermind_access_role mar ON mar.role_id = removed.role_id;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.remove_departed_member_role_memberships()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.remove_departed_member_role_memberships() IS
  'Deletes a departed workspace member''s role memberships in that workspace.';

CREATE TRIGGER remove_departed_member_role_memberships
AFTER DELETE ON public.workspace_members
FOR EACH ROW
EXECUTE FUNCTION private.remove_departed_member_role_memberships();

CREATE TRIGGER remove_moved_member_role_memberships
AFTER UPDATE OF ws_id, user_id ON public.workspace_members
FOR EACH ROW
WHEN ((OLD.ws_id, OLD.user_id) IS DISTINCT FROM (NEW.ws_id, NEW.user_id))
EXECUTE FUNCTION private.remove_departed_member_role_memberships();

-- Role memberships left behind by members removed before this trigger existed.
WITH removed AS (
  DELETE FROM public.workspace_role_members wrm
  USING public.workspace_roles wr
  WHERE wr.id = wrm.role_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.ws_id = wr.ws_id
        AND wm.user_id = wrm.user_id
    )
  RETURNING wrm.role_id, wrm.user_id
)
INSERT INTO private.mastermind_access_audit
  (action, target_user_id, role_id, changed, reason)
SELECT 'revoke', removed.user_id, removed.role_id, true,
  'Root workspace membership ended'
FROM removed
JOIN private.mastermind_access_role mar ON mar.role_id = removed.role_id;
