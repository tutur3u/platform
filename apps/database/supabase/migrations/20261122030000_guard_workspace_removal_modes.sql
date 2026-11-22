-- tuturuuu: no-grant (internal)
CREATE FUNCTION private.workspace_removal_authorized(
  p_ws_id uuid,
  p_actor_id uuid,
  p_mode text,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_actor_id IS NOT NULL AND CASE p_mode
    WHEN 'cms' THEN
      private.cms_guarded_removal_authorized(p_ws_id, p_actor_id, p_permission)
    WHEN 'workspace' THEN
      public.has_workspace_permission(p_ws_id, p_actor_id, p_permission)
      OR EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        JOIN public.workspace_default_permissions wdp
          ON wdp.ws_id = wm.ws_id AND wdp.member_type = wm.type
        WHERE wm.ws_id = p_ws_id AND wm.user_id = p_actor_id
          AND wm.type = 'GUEST'
          AND wdp.enabled AND wdp.permission::text IN ('admin', p_permission)
      )
    WHEN 'external_app' THEN
      public.is_org_member(p_actor_id, p_ws_id)
      AND public.has_workspace_permission(p_ws_id, p_actor_id, 'manage_workspace_members')
      AND public.has_workspace_permission(p_ws_id, p_actor_id, p_permission)
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION private.workspace_removal_authorized(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
CREATE FUNCTION private.workspace_lost_member_manager(p_ws_id uuid, p_had_manager boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_had_manager
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.ws_id = p_ws_id AND wm.type = 'MEMBER'
    )
    AND NOT private.workspace_has_member_manager(p_ws_id);
$$;

REVOKE ALL ON FUNCTION private.workspace_lost_member_manager(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

-- The external-app admin floor follows the people snapshot: broad admin or
-- both admin capabilities from defaults or across assigned roles, or creator.
-- The separate member-manager floor counts only full members.
-- tuturuuu: no-grant (internal)
CREATE FUNCTION private.external_app_workspace_has_admin(
  p_ws_id uuid,
  p_excluded_user_id uuid DEFAULT NULL,
  p_include_defaults boolean DEFAULT true
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
      AND wm.user_id IS DISTINCT FROM p_excluded_user_id
      AND (
        wm.user_id = w.creator_id
        OR (p_include_defaults AND EXISTS (
          SELECT 1
          FROM public.workspace_default_permissions wdp
          WHERE wdp.ws_id = wm.ws_id AND wdp.member_type = 'MEMBER'
            AND wdp.enabled
            AND wdp.permission IN ('admin', 'manage_workspace_members', 'manage_workspace_roles')
          HAVING bool_or(wdp.permission = 'admin') OR count(*) = 2
        ))
        OR EXISTS (
          SELECT 1
          FROM public.workspace_role_members wrm
          JOIN public.workspace_role_permissions wrp
            ON wrp.role_id = wrm.role_id AND wrp.ws_id = wm.ws_id
          WHERE wrm.user_id = wm.user_id AND wrp.enabled
            AND wrp.permission IN ('admin', 'manage_workspace_members', 'manage_workspace_roles')
          HAVING bool_or(wrp.permission = 'admin') OR count(DISTINCT wrp.permission) = 2
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.external_app_workspace_has_admin(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.remove_workspace_member_guarded_in_mode(
  p_ws_id uuid,
  p_user_id uuid,
  p_actor_id uuid,
  p_mode text,
  p_guard_self boolean DEFAULT false
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

  IF p_mode IS NULL OR p_mode NOT IN ('cms', 'workspace', 'external_app') THEN
    RETURN 'forbidden';
  END IF;

  SELECT w.creator_id INTO v_creator_id
  FROM public.workspaces w
  WHERE w.id = p_ws_id;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF private.workspace_removal_authorized(p_ws_id, p_actor_id, p_mode, 'manage_workspace_members') IS DISTINCT FROM true THEN
    RETURN 'forbidden';
  END IF;

  IF v_creator_id IS NOT NULL AND p_user_id IS NOT DISTINCT FROM v_creator_id THEN
    RETURN 'creator_protected';
  END IF;

  IF p_mode = 'external_app' AND p_user_id IS NOT DISTINCT FROM p_actor_id THEN
    RETURN 'self_protected';
  END IF;

  -- Recurrence acquires this gate before locking the series and member.
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

    IF (p_mode = 'cms' OR p_guard_self IS TRUE OR p_user_id IS DISTINCT FROM p_actor_id)
      AND private.workspace_lost_member_manager(p_ws_id, v_had_manager)
    THEN
      RAISE SQLSTATE 'PWR01' USING MESSAGE = 'Workspace must retain a member manager';
    END IF;

    IF p_mode = 'external_app' AND NOT private.external_app_workspace_has_admin(p_ws_id) THEN
      RAISE SQLSTATE 'PWR02' USING MESSAGE = 'Workspace must retain an external-app admin';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'PWR01' THEN
      RETURN 'last_manager';
    WHEN SQLSTATE 'PWR02' THEN
      RETURN 'last_admin';
  END;

  RETURN 'removed';
END;
$$;

REVOKE ALL ON FUNCTION public.remove_workspace_member_guarded_in_mode(uuid, uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member_guarded_in_mode(uuid, uuid, uuid, text, boolean)
  TO service_role;

COMMENT ON FUNCTION public.remove_workspace_member_guarded_in_mode(uuid, uuid, uuid, text, boolean) IS
  'A removal may leave zero full members. In workspace mode, p_guard_self controls whether the manager floor covers self-removal. CMS always applies the floor and external apps cannot remove themselves.';

CREATE FUNCTION public.remove_workspace_role_member_guarded_in_mode(
  p_ws_id uuid,
  p_role_id uuid,
  p_user_id uuid,
  p_actor_id uuid,
  p_mode text,
  p_guard_self boolean DEFAULT false
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

  -- External apps can demote a member atomically through their dedicated RPC.
  IF p_mode IS NULL OR p_mode NOT IN ('cms', 'workspace')
    OR private.workspace_removal_authorized(p_ws_id, p_actor_id, p_mode, 'manage_workspace_roles') IS DISTINCT FROM true
  THEN
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

    IF (p_mode = 'cms' OR p_guard_self IS TRUE OR p_user_id IS DISTINCT FROM p_actor_id)
      AND private.workspace_lost_member_manager(p_ws_id, v_had_manager)
    THEN
      RAISE SQLSTATE 'PWR01' USING MESSAGE = 'Workspace must retain a member manager';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'PWR01' THEN
      RETURN 'last_manager';
  END;

  RETURN 'removed';
END;
$$;

REVOKE ALL ON FUNCTION public.remove_workspace_role_member_guarded_in_mode(uuid, uuid, uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_workspace_role_member_guarded_in_mode(uuid, uuid, uuid, uuid, text, boolean)
  TO service_role;

CREATE FUNCTION public.delete_workspace_role_guarded(
  p_ws_id uuid,
  p_role_id uuid,
  p_actor_id uuid,
  p_mode text
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

  IF p_mode IS NULL OR p_mode NOT IN ('cms', 'workspace')
    OR private.workspace_removal_authorized(p_ws_id, p_actor_id, p_mode, 'manage_workspace_roles') IS DISTINCT FROM true
  THEN
    RETURN 'forbidden';
  END IF;

  -- The cascade deletes role memberships and permissions. The recurrence
  -- departure trigger fires only on workspace_members, which this never deletes.
  PERFORM 1
  FROM public.workspace_roles wr
  WHERE wr.id = p_role_id AND wr.ws_id = p_ws_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF EXISTS (SELECT 1 FROM private.mastermind_access_role mar WHERE mar.role_id = p_role_id) THEN
    RETURN 'role_protected';
  END IF;

  v_had_manager := private.workspace_has_member_manager(p_ws_id);

  BEGIN
    DELETE FROM public.workspace_roles wr
    WHERE wr.id = p_role_id AND wr.ws_id = p_ws_id;

    IF private.workspace_lost_member_manager(p_ws_id, v_had_manager) THEN
      RAISE SQLSTATE 'PWR01' USING MESSAGE = 'Workspace must retain a member manager';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'PWR01' THEN
      RETURN 'last_manager';
  END;

  RETURN 'removed';
END;
$$;

REVOKE ALL ON FUNCTION public.delete_workspace_role_guarded(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_workspace_role_guarded(uuid, uuid, uuid, text)
  TO service_role;

-- A demotion removes all roles with enabled admin grants and may also disable
-- the two MEMBER defaults. A null target disables the defaults alone.
CREATE FUNCTION public.reduce_external_app_workspace_admin_guarded(
  p_ws_id uuid,
  p_actor_id uuid,
  p_disable_default_admin boolean,
  p_user_id uuid DEFAULT NULL
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

  IF private.workspace_removal_authorized(p_ws_id, p_actor_id, 'external_app', 'manage_workspace_roles') IS DISTINCT FROM true THEN
    RETURN 'forbidden';
  END IF;

  SELECT w.creator_id INTO v_creator_id FROM public.workspaces w WHERE w.id = p_ws_id;
  IF p_user_id IS NOT NULL AND p_user_id IS NOT DISTINCT FROM v_creator_id THEN
    RETURN 'creator_protected';
  END IF;

  IF p_user_id IS NOT DISTINCT FROM p_actor_id THEN
    RETURN 'self_protected';
  END IF;

  IF p_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.workspace_members wm WHERE wm.ws_id = p_ws_id AND wm.user_id = p_user_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.task_board_shares tbs
      JOIN public.workspace_boards wb ON wb.id = tbs.board_id AND wb.ws_id = p_ws_id
      WHERE tbs.shared_with_user_id = p_user_id
    )
  THEN
    RETURN 'not_found';
  END IF;

  IF p_disable_default_admin IS DISTINCT FROM true THEN
    IF p_user_id IS NULL THEN
      RETURN 'forbidden';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.workspace_default_permissions wdp
      WHERE wdp.ws_id = p_ws_id AND wdp.member_type = 'MEMBER' AND wdp.enabled
        AND wdp.permission IN ('admin', 'manage_workspace_members', 'manage_workspace_roles')
      HAVING bool_or(wdp.permission = 'admin') OR count(*) = 2
    ) THEN
      RETURN 'default_admin_enabled';
    END IF;
  END IF;

  v_had_manager := private.workspace_has_member_manager(p_ws_id);

  BEGIN
    IF p_disable_default_admin IS TRUE THEN
      INSERT INTO public.workspace_default_permissions (ws_id, member_type, permission, enabled)
      VALUES
        (p_ws_id, 'MEMBER', 'manage_workspace_members', false),
        (p_ws_id, 'MEMBER', 'manage_workspace_roles', false)
      ON CONFLICT (ws_id, permission, member_type) DO UPDATE SET enabled = excluded.enabled;
    END IF;

    DELETE FROM public.workspace_role_members wrm
    WHERE wrm.user_id = p_user_id
      AND EXISTS (
        SELECT 1
        FROM public.workspace_role_permissions wrp
        WHERE wrp.role_id = wrm.role_id AND wrp.ws_id = p_ws_id AND wrp.enabled
          AND wrp.permission IN ('admin', 'manage_workspace_members', 'manage_workspace_roles')
      );

    IF private.workspace_lost_member_manager(p_ws_id, v_had_manager) THEN
      RAISE SQLSTATE 'PWR01' USING MESSAGE = 'Workspace must retain a member manager';
    END IF;

    -- The prospective admin snapshot excludes the demoted person and omits
    -- default-derived admins when the request confirms disabling default admin.
    IF NOT private.external_app_workspace_has_admin(
      p_ws_id, p_user_id, p_disable_default_admin IS DISTINCT FROM true
    ) THEN
      RAISE SQLSTATE 'PWR02' USING MESSAGE = 'Workspace must retain an external-app admin';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'PWR01' THEN
      RETURN 'last_manager';
    WHEN SQLSTATE 'PWR02' THEN
      RETURN 'last_admin';
  END;

  RETURN 'removed';
END;
$$;

REVOKE ALL ON FUNCTION public.reduce_external_app_workspace_admin_guarded(uuid, uuid, boolean, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reduce_external_app_workspace_admin_guarded(uuid, uuid, boolean, uuid)
  TO service_role;
