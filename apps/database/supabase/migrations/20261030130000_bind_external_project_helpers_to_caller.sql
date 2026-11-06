-- Match the consolidated permission predicates: end-user JWTs evaluate self
-- outside triggers; trusted roles and trigger evaluation retain their scope.
BEGIN;

CREATE OR REPLACE FUNCTION "public"."is_root_external_project_admin"(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND p_user_id IS DISTINCT FROM auth.uid()
  THEN
    RETURN false;
  END IF;

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

CREATE OR REPLACE FUNCTION "public"."can_manage_workspace_external_projects"(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND p_user_id IS DISTINCT FROM auth.uid()
  THEN
    RETURN false;
  END IF;

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

CREATE OR REPLACE FUNCTION "public"."can_publish_workspace_external_projects"(
  p_ws_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() = 0
    AND coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IN ('anon', 'authenticated')
    AND p_user_id IS DISTINCT FROM auth.uid()
  THEN
    RETURN false;
  END IF;

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

REVOKE ALL ON FUNCTION public.is_root_external_project_admin(uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.is_root_external_project_admin(uuid) review=SR-330-caller-bound
GRANT EXECUTE ON FUNCTION public.is_root_external_project_admin(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_manage_workspace_external_projects(uuid,uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.can_manage_workspace_external_projects(uuid,uuid) review=SR-330-caller-bound
GRANT EXECUTE ON FUNCTION public.can_manage_workspace_external_projects(uuid,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.can_publish_workspace_external_projects(uuid,uuid) FROM PUBLIC, anon, authenticated;
-- tuturuuu: reviewed(function-grant): public.can_publish_workspace_external_projects(uuid,uuid) review=SR-330-caller-bound
GRANT EXECUTE ON FUNCTION public.can_publish_workspace_external_projects(uuid,uuid) TO authenticated, service_role;

COMMIT;
