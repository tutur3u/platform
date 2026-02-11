-- Backfill admin permission for all existing workspaces that don't have it
-- The trigger (created in 20260118160013_add_admin_permission.sql) handles new workspaces
-- This migration ensures consistency for workspaces created before that trigger existed
-- Insert admin permission for all workspaces that don't already have it
INSERT INTO
  public.workspace_default_permissions (ws_id, permission, enabled)
SELECT
  w.id,
  'admin' :: workspace_role_permission,
  true
FROM
  public.workspaces w
WHERE
  w.personal IS TRUE
  AND NOT EXISTS (
    SELECT
      1
    FROM
      public.workspace_default_permissions wdp
    WHERE
      wdp.ws_id = w.id
      AND wdp.permission = 'admin'
  ) ON CONFLICT (ws_id, permission) DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE public.workspace_default_permissions IS 'Default permissions for workspace members. All workspaces have admin permission enabled by default, granting full access to workspace features.';