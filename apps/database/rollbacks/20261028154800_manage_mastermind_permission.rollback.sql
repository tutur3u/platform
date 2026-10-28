-- Rollback for 20261028154800_manage_mastermind_permission.sql.
--
-- Fails closed: every manage_mastermind grant is removed before the guards go,
-- so no role or member holds it afterwards. Postgres cannot drop an enum
-- value, so 'manage_mastermind' stays in public.workspace_role_permission as
-- an ungranted label, and has_workspace_permission keeps denying it outright
-- so a creator or admin never inherits it once the guards are gone. The audit
-- table is kept as evidence: it is private, RLS-enabled and revoked from every
-- API role. Grants nothing to anon or PUBLIC.

BEGIN;

DELETE FROM public.workspace_role_permissions
WHERE permission::text = 'manage_mastermind';

DELETE FROM public.workspace_default_permissions
WHERE permission::text = 'manage_mastermind';

DROP TRIGGER IF EXISTS guard_mastermind_role_permission
  ON public.workspace_role_permissions;
DROP TRIGGER IF EXISTS guard_mastermind_default_permission
  ON public.workspace_default_permissions;
DROP TRIGGER IF EXISTS guard_mastermind_role_member
  ON public.workspace_role_members;

DROP FUNCTION IF EXISTS private.grant_mastermind_access(uuid, text);
DROP FUNCTION IF EXISTS private.revoke_mastermind_access(uuid, text);
DROP FUNCTION IF EXISTS private.guard_mastermind_role_permission();
DROP FUNCTION IF EXISTS private.guard_mastermind_default_permission();
DROP FUNCTION IF EXISTS private.guard_mastermind_role_member();
DROP FUNCTION IF EXISTS private.mastermind_grant_allowed();

-- Restores the definition from
-- 20260516180000_typed_workspace_default_permissions.sql with the search_path
-- set by 20261024025000_harden_owned_definer_search_paths.sql, plus a
-- fail-closed manage_mastermind denial. Its ACL is unchanged by CREATE OR
-- REPLACE.
CREATE OR REPLACE FUNCTION public.has_workspace_permission(
  p_ws_id uuid,
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  -- The enum value outlives the rollback; nobody may hold it.
  IF p_permission = 'manage_mastermind' THEN
    RETURN false;
  END IF;

  -- Workspace creators keep full workspace access.
  IF EXISTS (
    SELECT 1
    FROM public.workspaces
    WHERE id = p_ws_id
      AND creator_id = p_user_id
  ) THEN
    RETURN true;
  END IF;

  -- Default and role workspace permissions are member-only. Guests use the
  -- guest default evaluator in application code, plus workspace_guest_permissions
  -- for resource-scoped grants such as course access.
  IF NOT public.is_org_member(p_user_id, p_ws_id) THEN
    RETURN false;
  END IF;

  -- Admin grants all member permissions except manage_subscription.
  IF p_permission != 'manage_subscription' AND EXISTS (
    SELECT 1
    FROM public.workspace_role_members wrm
    JOIN public.workspace_role_permissions wrp
      ON wrp.role_id = wrm.role_id
     AND wrp.ws_id = p_ws_id
    WHERE wrm.user_id = p_user_id
      AND wrp.permission = 'admin'::public.workspace_role_permission
      AND wrp.enabled = true

    UNION

    SELECT 1
    FROM public.workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.permission = 'admin'::public.workspace_role_permission
      AND wdp.member_type = 'MEMBER'::public.workspace_member_type
      AND wdp.enabled = true
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.workspace_role_members wrm
    JOIN public.workspace_role_permissions wrp
      ON wrp.role_id = wrm.role_id
     AND wrp.ws_id = p_ws_id
    WHERE wrm.user_id = p_user_id
      AND wrp.permission = p_permission::public.workspace_role_permission
      AND wrp.enabled = true

    UNION

    SELECT 1
    FROM public.workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.permission = p_permission::public.workspace_role_permission
      AND wdp.member_type = 'MEMBER'::public.workspace_member_type
      AND wdp.enabled = true
  );
END;
$$;

COMMENT ON FUNCTION public.has_workspace_permission(uuid, uuid, text) IS
  'Checks member workspace permissions. Priority: 0) manage_mastermind is denied (rolled back), 1) workspace creators, 2) MEMBER role/default admin except manage_subscription, 3) MEMBER role/default explicit grants. GUEST defaults are evaluated separately and missing guest rows deny access.';

COMMIT;
