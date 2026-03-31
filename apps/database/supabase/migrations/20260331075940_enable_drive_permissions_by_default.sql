INSERT INTO
  public.workspace_default_permissions (ws_id, permission, enabled)
SELECT
  w.id,
  p.permission,
  true
FROM
  public.workspaces w
  CROSS JOIN (
    VALUES
      ('view_drive' :: workspace_role_permission),
      ('manage_drive_tasks_directory' :: workspace_role_permission)
  ) AS p(permission) ON CONFLICT (ws_id, permission) DO
UPDATE
SET
  enabled = EXCLUDED.enabled;

CREATE OR REPLACE FUNCTION public.initialize_workspace_admin_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.workspace_default_permissions (ws_id, permission, enabled)
  VALUES
    (NEW.id, 'admin', true),
    (NEW.id, 'view_drive', true),
    (NEW.id, 'manage_drive_tasks_directory', true)
  ON CONFLICT (ws_id, permission) DO UPDATE
  SET enabled = EXCLUDED.enabled;

  RETURN NEW;
END;
$$;
