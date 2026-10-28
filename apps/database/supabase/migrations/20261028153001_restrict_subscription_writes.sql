-- Billing state is written only by the service role (Polar webhooks, sync
-- jobs and server routes using the admin client). Members holding
-- manage_subscription keep read access through the existing SELECT policies.
--
-- manage_subscription is not implied by admin (see has_workspace_permission),
-- so only the workspace creator may enable it on a role or default
-- permission, or add members to a role that holds it.

-- 1. workspace_subscriptions: read-only for API users.
DROP POLICY IF EXISTS "allow users to create subscriptions"
  ON public.workspace_subscriptions;
DROP POLICY IF EXISTS "allow users to edit subscriptions"
  ON public.workspace_subscriptions;
DROP POLICY IF EXISTS "allow users to delete subscriptions"
  ON public.workspace_subscriptions;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.workspace_subscriptions FROM anon, authenticated;

-- 2. workspace_orders: read-only for API users.
DROP POLICY IF EXISTS "allow users to create orders"
  ON public.workspace_orders;
DROP POLICY IF EXISTS "allow users to update orders"
  ON public.workspace_orders;
DROP POLICY IF EXISTS "allow users to delete orders"
  ON public.workspace_orders;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.workspace_orders FROM anon, authenticated;

-- 3. Creator-only grants of manage_subscription.
--
-- The guards run as the invoker so current_user identifies direct API writes
-- (authenticated/anon). The service role and vetted SECURITY DEFINER routines
-- run as other roles and are not checked here. Disabling and deleting stay
-- open; re-saving an already enabled grant is not a new grant.
CREATE OR REPLACE FUNCTION private.guard_creator_grant_role_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon')
    OR NEW.permission::text <> 'manage_subscription'
    OR NOT NEW.enabled THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.enabled
    AND OLD.permission = NEW.permission
    AND OLD.role_id = NEW.role_id
    AND OLD.ws_id = NEW.ws_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1
    FROM public.workspace_role_permissions wrp
    WHERE wrp.ws_id = NEW.ws_id
      AND wrp.role_id = NEW.role_id
      AND wrp.permission = NEW.permission
      AND wrp.enabled
  ) THEN
    -- BEFORE INSERT runs before ON CONFLICT resolves the existing grant.
    RETURN NEW;
  END IF;

  IF NOT public.is_workspace_owner(NEW.ws_id, auth.uid()) THEN
    RAISE EXCEPTION 'only the workspace creator can grant manage_subscription'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_creator_grant_default_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon')
    OR NEW.permission::text <> 'manage_subscription'
    OR NOT NEW.enabled THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.enabled
    AND OLD.permission = NEW.permission
    AND OLD.member_type = NEW.member_type
    AND OLD.ws_id = NEW.ws_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1
    FROM public.workspace_default_permissions wdp
    WHERE wdp.ws_id = NEW.ws_id
      AND wdp.member_type = NEW.member_type
      AND wdp.permission = NEW.permission
      AND wdp.enabled
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_workspace_owner(NEW.ws_id, auth.uid()) THEN
    RAISE EXCEPTION 'only the workspace creator can grant manage_subscription'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_creator_grant_role_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_ws_id uuid;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.role_id = NEW.role_id
    AND OLD.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT wr.ws_id INTO v_ws_id
  FROM public.workspace_roles wr
  WHERE wr.id = NEW.role_id;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_role_permissions wrp
    WHERE wrp.role_id = NEW.role_id
      AND wrp.permission::text = 'manage_subscription'
      AND wrp.enabled
  ) AND (
    v_ws_id IS NULL
    OR NOT public.is_workspace_owner(v_ws_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'only the workspace creator can add members to a role with manage_subscription'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_creator_grant_role_permission()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_creator_grant_default_permission()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_creator_grant_role_member()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_creator_grant_role_permission
  ON public.workspace_role_permissions;
CREATE TRIGGER guard_creator_grant_role_permission
  BEFORE INSERT OR UPDATE ON public.workspace_role_permissions
  FOR EACH ROW EXECUTE FUNCTION private.guard_creator_grant_role_permission();

DROP TRIGGER IF EXISTS guard_creator_grant_default_permission
  ON public.workspace_default_permissions;
CREATE TRIGGER guard_creator_grant_default_permission
  BEFORE INSERT OR UPDATE ON public.workspace_default_permissions
  FOR EACH ROW EXECUTE FUNCTION private.guard_creator_grant_default_permission();

DROP TRIGGER IF EXISTS guard_creator_grant_role_member
  ON public.workspace_role_members;
CREATE TRIGGER guard_creator_grant_role_member
  BEFORE INSERT OR UPDATE ON public.workspace_role_members
  FOR EACH ROW EXECUTE FUNCTION private.guard_creator_grant_role_member();
