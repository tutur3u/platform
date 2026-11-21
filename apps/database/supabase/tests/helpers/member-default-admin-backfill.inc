-- Verbatim copy of migrations/20261121162000_member_default_admin_least_privilege.sql
-- (the pgTAP runner mounts only tests/). Migrations are immutable once merged.
-- Workspace members receive no `admin` permission by default.
--
-- New workspaces seed only the drive and chat MEMBER defaults; `admin` comes
-- from an explicit role the creator (or a role manager) assigns. Existing
-- workspaces whose MEMBER defaults enable `admin` keep their current members'
-- access through an explicit "Workspace Admin (preserved)" role, the same role
-- the POS operator setup path creates. Their role-less API keys, which read
-- MEMBER defaults too, are assigned that role. Then the MEMBER `admin` default
-- is disabled so later invitees and invite-link joiners no longer inherit it.
-- API keys that already hold a role keep that role plus the remaining
-- defaults; widening their role would also widen its members.
-- A preserved-named role is reused only when it holds no creator-grant or
-- explicit-grant permission (manage_subscription, manage_mastermind,
-- operate_mira_channels) and is not the recorded Mastermind role; otherwise a
-- fresh role is created, so enrollment never grants more than admin did.
-- Every statement is idempotent: rerunning it finds no enabled MEMBER `admin`
-- default and changes nothing.

-- tuturuuu: no-grant (trigger)
CREATE OR REPLACE FUNCTION public.initialize_workspace_admin_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  INSERT INTO public.workspace_default_permissions
    (ws_id, permission, member_type, enabled)
  VALUES
    (NEW.id, 'view_drive', 'MEMBER', true),
    (NEW.id, 'manage_drive_tasks_directory', 'MEMBER', true),
    (NEW.id, 'view_chat', 'MEMBER', true),
    (NEW.id, 'create_chat', 'MEMBER', true)
  ON CONFLICT (ws_id, permission, member_type) DO UPDATE
  SET enabled = EXCLUDED.enabled;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_workspace_admin_permission()
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.initialize_workspace_admin_permission() IS
  'Initializes MEMBER default permissions (drive and chat) for newly created workspaces. Never seeds admin.';

COMMENT ON TABLE public.workspace_default_permissions IS
  'Default permissions for workspace members by member type. MEMBER admin is never seeded; admin access comes from explicit roles.';

-- 1. One preserved admin role per workspace that has non-creator MEMBERs or
--    role-less API keys relying on the MEMBER admin default.
INSERT INTO public.workspace_roles (name, ws_id)
SELECT 'Workspace Admin (preserved)', w.id
FROM public.workspaces w
WHERE EXISTS (
    SELECT 1
    FROM public.workspace_default_permissions wdp
    WHERE wdp.ws_id = w.id
      AND wdp.member_type = 'MEMBER'::public.workspace_member_type
      AND wdp.permission = 'admin'::public.workspace_role_permission
      AND wdp.enabled = true
  )
  AND (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.ws_id = w.id
        AND wm.type = 'MEMBER'::public.workspace_member_type
        AND wm.user_id IS DISTINCT FROM w.creator_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.workspace_api_keys k
      WHERE k.ws_id = w.id
        AND k.role_id IS NULL
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_roles wr
    WHERE wr.ws_id = w.id
      AND wr.name = 'Workspace Admin (preserved)'
      AND NOT EXISTS (
        SELECT 1
        FROM public.workspace_role_permissions x
        WHERE x.role_id = wr.id
          AND x.permission::text IN
            ('manage_subscription', 'manage_mastermind', 'operate_mira_channels')
      )
      AND NOT EXISTS (
        SELECT 1 FROM private.mastermind_access_role m WHERE m.role_id = wr.id
      )
  );

-- 2. Grant admin on the earliest preserved role of each affected workspace.
INSERT INTO public.workspace_role_permissions (enabled, permission, role_id, ws_id)
SELECT DISTINCT ON (wr.ws_id)
  true, 'admin'::public.workspace_role_permission, wr.id, wr.ws_id
FROM public.workspace_roles wr
JOIN public.workspace_default_permissions wdp
  ON wdp.ws_id = wr.ws_id
 AND wdp.member_type = 'MEMBER'::public.workspace_member_type
 AND wdp.permission = 'admin'::public.workspace_role_permission
 AND wdp.enabled = true
WHERE wr.name = 'Workspace Admin (preserved)'
  AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_role_permissions x
    WHERE x.role_id = wr.id
      AND x.permission::text IN
        ('manage_subscription', 'manage_mastermind', 'operate_mira_channels')
  )
  AND NOT EXISTS (
    SELECT 1 FROM private.mastermind_access_role m WHERE m.role_id = wr.id
  )
ORDER BY wr.ws_id, wr.created_at ASC, wr.id ASC
ON CONFLICT (ws_id, permission, role_id) DO UPDATE SET enabled = true;

-- 3. Enroll every current non-creator MEMBER in that role.
INSERT INTO public.workspace_role_members (role_id, user_id)
SELECT preserved.role_id, wm.user_id
FROM (
  SELECT DISTINCT ON (wr.ws_id) wr.ws_id, wr.id AS role_id
  FROM public.workspace_roles wr
  JOIN public.workspace_default_permissions wdp
    ON wdp.ws_id = wr.ws_id
   AND wdp.member_type = 'MEMBER'::public.workspace_member_type
   AND wdp.permission = 'admin'::public.workspace_role_permission
   AND wdp.enabled = true
  WHERE wr.name = 'Workspace Admin (preserved)'
    AND NOT EXISTS (
      SELECT 1
      FROM public.workspace_role_permissions x
      WHERE x.role_id = wr.id
        AND x.permission::text IN
          ('manage_subscription', 'manage_mastermind', 'operate_mira_channels')
    )
    AND NOT EXISTS (
      SELECT 1 FROM private.mastermind_access_role m WHERE m.role_id = wr.id
    )
  ORDER BY wr.ws_id, wr.created_at ASC, wr.id ASC
) preserved
JOIN public.workspaces w ON w.id = preserved.ws_id
JOIN public.workspace_members wm
  ON wm.ws_id = preserved.ws_id
 AND wm.type = 'MEMBER'::public.workspace_member_type
 AND wm.user_id IS DISTINCT FROM w.creator_id
ON CONFLICT (role_id, user_id) DO NOTHING;

-- 4. Assign that role to every role-less API key of the workspace.
UPDATE public.workspace_api_keys k
SET role_id = preserved.role_id
FROM (
  SELECT DISTINCT ON (wr.ws_id) wr.ws_id, wr.id AS role_id
  FROM public.workspace_roles wr
  JOIN public.workspace_default_permissions wdp
    ON wdp.ws_id = wr.ws_id
   AND wdp.member_type = 'MEMBER'::public.workspace_member_type
   AND wdp.permission = 'admin'::public.workspace_role_permission
   AND wdp.enabled = true
  WHERE wr.name = 'Workspace Admin (preserved)'
    AND NOT EXISTS (
      SELECT 1
      FROM public.workspace_role_permissions x
      WHERE x.role_id = wr.id
        AND x.permission::text IN
          ('manage_subscription', 'manage_mastermind', 'operate_mira_channels')
    )
    AND NOT EXISTS (
      SELECT 1 FROM private.mastermind_access_role m WHERE m.role_id = wr.id
    )
  ORDER BY wr.ws_id, wr.created_at ASC, wr.id ASC
) preserved
WHERE k.ws_id = preserved.ws_id
  AND k.role_id IS NULL;

-- 5. Disable the MEMBER admin default everywhere, personal workspaces included,
--    so a workspace that later stops being personal cannot hand admin to new
--    members.
UPDATE public.workspace_default_permissions
SET enabled = false
WHERE member_type = 'MEMBER'::public.workspace_member_type
  AND permission = 'admin'::public.workspace_role_permission
  AND enabled = true;
