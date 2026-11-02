BEGIN;
SET LOCAL lock_timeout = '5s';
-- Rollback order: 131100 -> 131000 -> 130950 -> 130100 -> 130000.
-- Drop the composite FK in 131000 before the quarantine rollback (130950).

-- Restore definition from 20260401190000_external_project_studio.sql
CREATE OR REPLACE FUNCTION "public"."is_root_external_project_admin"(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = '00000000-0000-0000-0000-000000000000'::uuid
      AND w.creator_id = p_user_id
  ) OR public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_user_id,
    'admin'
  ) OR public.has_workspace_permission(
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_user_id,
    'manage_external_projects'
  );
END;
$$;

-- Restore definition from 20260401190000_external_project_studio.sql
CREATE OR REPLACE FUNCTION "public"."can_manage_workspace_external_projects"(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.is_root_external_project_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.workspaces w
      WHERE w.id = p_ws_id
        AND w.creator_id = p_user_id
    )
    OR public.has_workspace_permission(p_ws_id, p_user_id, 'admin')
    OR public.has_workspace_permission(
      p_ws_id,
      p_user_id,
      'manage_external_projects'
    );
END;
$$;

-- Restore definition from 20260401190000_external_project_studio.sql
CREATE OR REPLACE FUNCTION "public"."can_publish_workspace_external_projects"(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.can_manage_workspace_external_projects(p_ws_id, p_user_id)
    OR public.has_workspace_permission(
      p_ws_id,
      p_user_id,
      'publish_external_projects'
    );
END;
$$;




-- Preserve the matching forward migration ACLs while restoring prior bodies.
REVOKE ALL ON FUNCTION public.is_root_external_project_admin(uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_root_external_project_admin(uuid) review=https://github.com/tutur3u/platform/pull/7359
GRANT EXECUTE ON FUNCTION public.is_root_external_project_admin(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_workspace_external_projects(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.can_manage_workspace_external_projects(uuid,uuid) review=https://github.com/tutur3u/platform/pull/7359
GRANT EXECUTE ON FUNCTION public.can_manage_workspace_external_projects(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_publish_workspace_external_projects(uuid, uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.can_publish_workspace_external_projects(uuid,uuid) review=https://github.com/tutur3u/platform/pull/7359
GRANT EXECUTE ON FUNCTION public.can_publish_workspace_external_projects(uuid, uuid) TO authenticated, service_role;

COMMIT;
