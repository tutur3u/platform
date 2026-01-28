-- Fix manage_subscription permission to NOT be auto-granted by admin permission
-- This is a critical security fix: admin permission should NOT bypass manage_subscription
-- Only workspace creators and users explicitly granted manage_subscription can manage billing

CREATE OR REPLACE FUNCTION public.has_workspace_permission(
  p_ws_id uuid,
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- First check if user is the workspace creator
  -- Creators automatically have all permissions
  IF EXISTS (
    SELECT 1 FROM workspaces
    WHERE id = p_ws_id AND creator_id = p_user_id
  ) THEN
    RETURN true;
  END IF;

  -- Check if user has admin permission (bypasses all other checks EXCEPT manage_subscription)
  -- SECURITY FIX: admin permission does NOT auto-grant manage_subscription
  -- This prevents any member from charging the creator's payment method
  IF p_permission != 'manage_subscription' AND EXISTS (
    SELECT 1
    FROM workspace_role_members wrm
    JOIN workspace_role_permissions wrp ON wrp.role_id = wrm.role_id AND wrp.ws_id = p_ws_id
    WHERE wrm.user_id = p_user_id
      AND wrp.permission = 'admin'::public.workspace_role_permission
      AND wrp.enabled = true
    UNION
    SELECT 1
    FROM workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.permission = 'admin'::public.workspace_role_permission
      AND wdp.enabled = true
  ) THEN
    RETURN true;
  END IF;

  -- Standard permission check via roles or defaults
  -- For manage_subscription, this is the ONLY path (besides creator check above)
  RETURN EXISTS (
    SELECT 1
    FROM workspace_role_members wrm
    JOIN workspace_role_permissions wrp ON wrp.role_id = wrm.role_id AND wrp.ws_id = p_ws_id
    WHERE wrm.user_id = p_user_id
      AND wrp.permission = p_permission::public.workspace_role_permission
      AND wrp.enabled = true
    UNION
    SELECT 1
    FROM workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.permission = p_permission::public.workspace_role_permission
      AND wdp.enabled = true
  );
END;
$$;

-- Update comment to document the security fix
COMMENT ON FUNCTION public.has_workspace_permission(uuid, uuid, text) IS
  'Checks if a user has a specific permission in a workspace. Priority: 1) Workspace creators have all permissions, 2) Users with admin permission have all permissions EXCEPT manage_subscription (billing security), 3) Standard role/default permission checks for explicit grants.';
