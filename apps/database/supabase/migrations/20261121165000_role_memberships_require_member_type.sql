-- Workspace roles belong to live MEMBER memberships only.
--
-- A BEFORE INSERT/UPDATE guard on workspace_role_members requires the user to
-- hold a MEMBER row in the role's workspace. It locks that row FOR SHARE, so a
-- concurrent removal or demotion waits for the insert and then deletes the new
-- role row, or the insert waits for it and is refused. Demoting a MEMBER to
-- GUEST ends their role memberships in that workspace the same way removal
-- does, including a revoke in private.mastermind_access_audit for the recorded
-- Mastermind role. Existing role memberships held by guests are deleted once.

-- tuturuuu: no-grant (trigger)
CREATE OR REPLACE FUNCTION private.remove_departed_member_role_memberships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_reason text := 'Root workspace membership ended';
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.ws_id = NEW.ws_id
    AND OLD.user_id = NEW.user_id THEN
    v_reason := 'Root workspace membership demoted to guest';
  END IF;

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
  SELECT 'revoke', removed.user_id, removed.role_id, true, v_reason
  FROM removed
  JOIN private.mastermind_access_role mar ON mar.role_id = removed.role_id;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.remove_departed_member_role_memberships()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.remove_departed_member_role_memberships() IS
  'Deletes a departed or guest-demoted workspace member''s role memberships in that workspace.';

CREATE TRIGGER remove_demoted_member_role_memberships
AFTER UPDATE OF type ON public.workspace_members
FOR EACH ROW
WHEN (
  OLD.type = 'MEMBER'::public.workspace_member_type
  AND NEW.type IS DISTINCT FROM 'MEMBER'::public.workspace_member_type
  AND OLD.ws_id = NEW.ws_id
  AND OLD.user_id = NEW.user_id
)
EXECUTE FUNCTION private.remove_departed_member_role_memberships();

-- tuturuuu: no-grant (trigger)
CREATE FUNCTION private.guard_role_member_requires_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND OLD.role_id = NEW.role_id
    AND OLD.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM public.workspace_roles wr
  JOIN public.workspace_members wm
    ON wm.ws_id = wr.ws_id
   AND wm.user_id = NEW.user_id
   AND wm.type = 'MEMBER'::public.workspace_member_type
  WHERE wr.id = NEW.role_id
  FOR SHARE OF wm;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace roles can only be held by members of the role''s workspace'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_role_member_requires_membership()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.guard_role_member_requires_membership() IS
  'Refuses a workspace role membership unless the user is a MEMBER of the role''s workspace.';

CREATE TRIGGER guard_role_member_requires_membership
BEFORE INSERT OR UPDATE OF role_id, user_id ON public.workspace_role_members
FOR EACH ROW
EXECUTE FUNCTION private.guard_role_member_requires_membership();

-- Role memberships held by guests or non-members, including any created
-- between the previous cleanup and this guard.
WITH removed AS (
  DELETE FROM public.workspace_role_members wrm
  USING public.workspace_roles wr
  WHERE wr.id = wrm.role_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.ws_id = wr.ws_id
        AND wm.user_id = wrm.user_id
        AND wm.type = 'MEMBER'::public.workspace_member_type
    )
  RETURNING wrm.role_id, wrm.user_id
)
INSERT INTO private.mastermind_access_audit
  (action, target_user_id, role_id, changed, reason)
SELECT 'revoke', removed.user_id, removed.role_id, true,
  'Root workspace role held without a MEMBER membership'
FROM removed
JOIN private.mastermind_access_role mar ON mar.role_id = removed.role_id;
