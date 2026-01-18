-- Add 'admin' permission that bypasses all other permission checks
-- This permission grants full access to all workspace features when enabled
-- It is automatically enabled for new workspaces

-- 1. Add 'admin' to the workspace_role_permission enum
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'admin';

-- 2. Update has_workspace_permission to check for admin permission first
-- This allows users with admin permission to bypass individual permission checks
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

  -- Check if user has admin permission (bypasses all other checks)
  IF EXISTS (
    SELECT 1
    FROM workspace_role_members wrm
    JOIN workspace_role_permissions wrp ON wrp.role_id = wrm.role_id AND wrp.ws_id = p_ws_id
    WHERE wrm.user_id = p_user_id
      AND wrp.permission = 'admin'::"public"."workspace_role_permission"
      AND wrp.enabled = true
    UNION
    SELECT 1
    FROM workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.permission = 'admin'::"public"."workspace_role_permission"
      AND wdp.enabled = true
  ) THEN
    RETURN true;
  END IF;

  -- Standard permission check via roles or defaults
  RETURN EXISTS (
    SELECT 1
    FROM workspace_role_members wrm
    JOIN workspace_role_permissions wrp ON wrp.role_id = wrm.role_id AND wrp.ws_id = p_ws_id
    WHERE wrm.user_id = p_user_id
      AND wrp.permission = p_permission::"public"."workspace_role_permission"
      AND wrp.enabled = true
    UNION
    SELECT 1
    FROM workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.permission = p_permission::"public"."workspace_role_permission"
      AND wdp.enabled = true
  );
END;
$$;

-- Update comment to reflect admin check
COMMENT ON FUNCTION public.has_workspace_permission(uuid, uuid, text) IS
  'Checks if a user has a specific permission in a workspace. Priority: 1) Workspace creators have all permissions, 2) Users with admin permission have all permissions, 3) Standard role/default permission checks.';

-- 3. Create trigger function to auto-insert admin permission for new workspaces
CREATE OR REPLACE FUNCTION public.initialize_workspace_admin_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert admin permission as enabled by default for new workspaces
  INSERT INTO public.workspace_default_permissions (ws_id, permission, enabled)
  VALUES (NEW.id, 'admin', true)
  ON CONFLICT (ws_id, permission) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- 4. Create trigger on workspace creation
DROP TRIGGER IF EXISTS trigger_initialize_workspace_admin_permission ON public.workspaces;

CREATE TRIGGER trigger_initialize_workspace_admin_permission
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.initialize_workspace_admin_permission();

-- 5. Add comment for documentation
COMMENT ON FUNCTION public.initialize_workspace_admin_permission() IS
  'Automatically inserts admin permission (enabled) for new workspaces, granting all members full access by default.';
