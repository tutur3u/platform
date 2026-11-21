-- The routes retain the credential checks. This actor predicate is the
-- union of their cookie and app-session permission paths.
-- tuturuuu: no-grant (internal)
CREATE FUNCTION private.cms_guarded_removal_authorized(
  p_ws_id uuid,
  p_actor_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  WITH effective AS (
    SELECT scope.ws_id, wanted.permission
    FROM (
      SELECT p_ws_id AS ws_id
      UNION
      SELECT '00000000-0000-0000-0000-000000000000'::uuid
    ) scope
    CROSS JOIN (VALUES
      (p_permission),
      ('manage_workspace_roles'),
      ('manage_external_projects'),
      ('publish_external_projects'),
      ('edit_external_projects')
    ) AS wanted(permission)
    WHERE public.has_workspace_permission(scope.ws_id, p_actor_id, wanted.permission)
  )
  SELECT p_actor_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM effective
      WHERE ws_id = '00000000-0000-0000-0000-000000000000'::uuid
        AND permission IN ('manage_external_projects', 'manage_workspace_roles')
    )
    -- Cookie membership reads are MEMBER-only under RLS. App sessions
    -- can read root guest defaults, with target membership for role writes
    -- or the CMS root-admin bootstrap for member writes.
    OR (
      (p_permission = 'manage_workspace_members' OR public.is_org_member(p_actor_id, p_ws_id))
      AND EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        JOIN public.workspace_default_permissions wdp
          ON wdp.ws_id = wm.ws_id AND wdp.member_type = wm.type
        WHERE wm.ws_id = '00000000-0000-0000-0000-000000000000'::uuid
          AND wm.user_id = p_actor_id
          AND wm.type = 'GUEST'::public.workspace_member_type
          AND wdp.enabled
          AND wdp.permission IN ('admin', 'manage_external_projects', 'manage_workspace_roles')
      )
    )
    OR (
      EXISTS (
        SELECT 1 FROM effective
        WHERE ws_id = p_ws_id AND permission = p_permission
      )
      AND EXISTS (
        SELECT 1 FROM effective
        WHERE ws_id = p_ws_id
          AND permission IN ('manage_external_projects', 'publish_external_projects', 'edit_external_projects')
      )
    )
  );
$$;

REVOKE ALL ON FUNCTION private.cms_guarded_removal_authorized(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
CREATE FUNCTION private.workspace_has_member_manager(
  p_ws_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.ws_id
    WHERE wm.ws_id = p_ws_id
      AND wm.type = 'MEMBER'::public.workspace_member_type
      AND (p_user_id IS NULL OR wm.user_id = p_user_id)
      AND (
        wm.user_id = w.creator_id
        OR EXISTS (
          SELECT 1
          FROM public.workspace_role_members wrm
          JOIN public.workspace_role_permissions wrp
            ON wrp.role_id = wrm.role_id AND wrp.ws_id = wm.ws_id
          WHERE wrm.user_id = wm.user_id
            AND wrp.enabled
            AND wrp.permission IN ('admin', 'manage_workspace_members')
        )
        OR EXISTS (
          SELECT 1
          FROM public.workspace_default_permissions wdp
          WHERE wdp.ws_id = wm.ws_id
            AND wdp.member_type = 'MEMBER'::public.workspace_member_type
            AND wdp.enabled
            AND wdp.permission IN ('admin', 'manage_workspace_members')
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.workspace_has_member_manager(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.remove_workspace_member_guarded(
  p_ws_id uuid,
  p_user_id uuid,
  p_actor_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_creator_id uuid;
  v_had_manager boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cms-member-removal/' || p_ws_id::text, 0));

  SELECT w.creator_id INTO v_creator_id
  FROM public.workspaces w
  WHERE w.id = p_ws_id;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF private.cms_guarded_removal_authorized(p_ws_id, p_actor_id, 'manage_workspace_members') IS DISTINCT FROM true THEN
    RETURN 'forbidden';
  END IF;

  IF v_creator_id IS NOT NULL AND p_user_id IS NOT DISTINCT FROM v_creator_id THEN
    RETURN 'creator_protected';
  END IF;

  -- Recurrence requests lock their gate before taking series and member
  -- locks. Wait on that gate before the member delete can lock either.
  PERFORM 1
  FROM private.task_recurrence_workspace gate
  WHERE gate.ws_id = p_ws_id
  FOR NO KEY UPDATE;

  v_had_manager := private.workspace_has_member_manager(p_ws_id);

  BEGIN
    DELETE FROM public.workspace_members wm
    WHERE wm.ws_id = p_ws_id AND wm.user_id = p_user_id;

    IF NOT FOUND THEN
      RETURN 'not_found';
    END IF;

    IF v_had_manager AND NOT private.workspace_has_member_manager(p_ws_id) THEN
      RAISE SQLSTATE 'PWR01' USING MESSAGE = 'Workspace must retain a member manager';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'PWR01' THEN
      RETURN 'last_manager';
  END;

  RETURN 'removed';
END;
$$;

REVOKE ALL ON FUNCTION public.remove_workspace_member_guarded(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.remove_workspace_member_guarded(uuid, uuid, uuid)
  TO service_role;

CREATE FUNCTION public.remove_workspace_role_member_guarded(
  p_ws_id uuid,
  p_role_id uuid,
  p_user_id uuid,
  p_actor_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_had_manager boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cms-member-removal/' || p_ws_id::text, 0));

  PERFORM 1
  FROM public.workspaces w
  WHERE w.id = p_ws_id;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF private.cms_guarded_removal_authorized(p_ws_id, p_actor_id, 'manage_workspace_roles') IS DISTINCT FROM true THEN
    RETURN 'forbidden';
  END IF;

  PERFORM 1
  FROM public.workspace_roles wr
  WHERE wr.id = p_role_id AND wr.ws_id = p_ws_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  v_had_manager := private.workspace_has_member_manager(p_ws_id);

  BEGIN
    DELETE FROM public.workspace_role_members wrm
    WHERE wrm.role_id = p_role_id AND wrm.user_id = p_user_id;

    IF NOT FOUND THEN
      RETURN 'not_found';
    END IF;

    IF v_had_manager AND NOT private.workspace_has_member_manager(p_ws_id) THEN
      RAISE SQLSTATE 'PWR01' USING MESSAGE = 'Workspace must retain a member manager';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'PWR01' THEN
      RETURN 'last_manager';
  END;

  RETURN 'removed';
END;
$$;

REVOKE ALL ON FUNCTION public.remove_workspace_role_member_guarded(uuid, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.remove_workspace_role_member_guarded(uuid, uuid, uuid, uuid)
  TO service_role;
