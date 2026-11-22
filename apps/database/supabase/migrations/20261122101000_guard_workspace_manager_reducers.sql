SET LOCAL lock_timeout = '5s';

-- tuturuuu: reviewed(function-grant) service role; actor and membership are checked in the workspace
CREATE OR REPLACE FUNCTION public.remove_workspace_member_guarded_in_mode(
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

  IF NOT (
    p_mode = 'workspace'
    AND p_user_id IS NOT DISTINCT FROM p_actor_id
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.ws_id = p_ws_id AND wm.user_id = p_actor_id
    )
  ) AND private.workspace_removal_authorized(
    p_ws_id, p_actor_id, p_mode, 'manage_workspace_members'
  ) IS DISTINCT FROM true THEN
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

    IF private.workspace_lost_member_manager(p_ws_id, v_had_manager) THEN
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
  'The manager floor applies to every removal. p_guard_self has no effect and is retained for call compatibility. A removal may leave zero full members. External apps cannot remove themselves.';

-- tuturuuu: reviewed(function-grant) service role; actor authorization and role ownership are retained
CREATE OR REPLACE FUNCTION public.remove_workspace_role_member_guarded_in_mode(
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

REVOKE ALL ON FUNCTION public.remove_workspace_role_member_guarded_in_mode(uuid, uuid, uuid, uuid, text, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_workspace_role_member_guarded_in_mode(uuid, uuid, uuid, uuid, text, boolean)
  TO service_role;

COMMENT ON FUNCTION public.remove_workspace_role_member_guarded_in_mode(uuid, uuid, uuid, uuid, text, boolean) IS
  'The manager floor applies to every role membership removal. p_guard_self has no effect and is retained for call compatibility.';

-- tuturuuu: reviewed(function-grant) service role; actor authorization and role ownership are rechecked under the removal lock
CREATE FUNCTION private.update_workspace_role_guarded(
  p_ws_id uuid,
  p_role_id uuid,
  p_actor_id uuid,
  p_mode text,
  p_permissions jsonb,
  p_name text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_role_name text;
  v_is_creator boolean;
  v_had_manager boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cms-member-removal/' || p_ws_id::text, 0));

  IF p_mode IS NULL OR p_mode NOT IN ('workspace', 'cms')
    OR private.workspace_removal_authorized(p_ws_id, p_actor_id, p_mode, 'manage_workspace_roles') IS DISTINCT FROM true
  THEN
    RETURN 'forbidden';
  END IF;

  -- Workspace deletion locks the workspace before cascading to its roles.
  SELECT w.creator_id IS NOT DISTINCT FROM p_actor_id INTO v_is_creator
  FROM public.workspaces w
  WHERE w.id = p_ws_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  SELECT wr.name INTO v_role_name
  FROM public.workspace_roles wr
  WHERE wr.id = p_role_id AND wr.ws_id = p_ws_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  IF p_name IS NOT NULL AND p_name IS DISTINCT FROM v_role_name THEN
    IF EXISTS (SELECT 1 FROM private.mastermind_access_role mar WHERE mar.role_id = p_role_id) THEN
      RETURN 'role_protected';
    END IF;

    IF private.workspace_role_creator_grants_owned_by_actor(p_role_id, p_actor_id, true) IS DISTINCT FROM true THEN
      RETURN 'creator_protected';
    END IF;
  END IF;

  v_had_manager := private.workspace_has_member_manager(p_ws_id);

  BEGIN
    INSERT INTO public.workspace_role_permissions (ws_id, role_id, permission, enabled)
    SELECT p_ws_id, p_role_id, edits.id, edits.enabled
    FROM pg_catalog.jsonb_to_recordset(p_permissions)
      AS edits(id public.workspace_role_permission, enabled boolean)
    WHERE edits.id NOT IN ('manage_mastermind', 'operate_mira_channels')
      AND (v_is_creator OR edits.id <> 'manage_subscription')
    ON CONFLICT (ws_id, role_id, permission) DO UPDATE SET enabled = EXCLUDED.enabled;

    UPDATE public.workspace_roles wr SET name = p_name
    WHERE wr.id = p_role_id AND wr.ws_id = p_ws_id
      AND p_name IS NOT NULL AND p_name IS DISTINCT FROM v_role_name;

    IF private.workspace_lost_member_manager(p_ws_id, v_had_manager) THEN
      RAISE SQLSTATE 'PWR01' USING MESSAGE = 'Workspace must retain a member manager';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'PWR01' THEN
      RETURN 'last_manager';
  END;

  RETURN 'updated';
END;
$$;

REVOKE ALL ON FUNCTION private.update_workspace_role_guarded(uuid, uuid, uuid, text, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.update_workspace_role_guarded(uuid, uuid, uuid, text, jsonb, text)
  TO service_role;

-- tuturuuu: reviewed(function-grant) service role; actor and target workspace are rechecked under the removal lock
CREATE FUNCTION private.update_workspace_default_permissions_guarded(
  p_ws_id uuid,
  p_actor_id uuid,
  p_mode text,
  p_member_type public.workspace_member_type,
  p_permissions jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_is_creator boolean;
  v_had_manager boolean;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cms-member-removal/' || p_ws_id::text, 0));

  IF p_mode IS NULL OR p_mode NOT IN ('workspace', 'cms')
    OR private.workspace_removal_authorized(p_ws_id, p_actor_id, p_mode, 'manage_workspace_roles') IS DISTINCT FROM true
  THEN
    RETURN 'forbidden';
  END IF;

  -- Workspace deletion locks the workspace before cascading to its defaults.
  SELECT w.creator_id IS NOT DISTINCT FROM p_actor_id INTO v_is_creator
  FROM public.workspaces w
  WHERE w.id = p_ws_id
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;

  v_had_manager := private.workspace_has_member_manager(p_ws_id);

  BEGIN
    INSERT INTO public.workspace_default_permissions (ws_id, member_type, permission, enabled)
    SELECT p_ws_id, p_member_type, edits.id, edits.enabled
    FROM pg_catalog.jsonb_to_recordset(p_permissions)
      AS edits(id public.workspace_role_permission, enabled boolean)
    WHERE edits.id NOT IN ('manage_mastermind', 'operate_mira_channels')
      AND (v_is_creator OR edits.id <> 'manage_subscription')
    ON CONFLICT (ws_id, permission, member_type) DO UPDATE SET enabled = EXCLUDED.enabled;

    IF private.workspace_lost_member_manager(p_ws_id, v_had_manager) THEN
      RAISE SQLSTATE 'PWR01' USING MESSAGE = 'Workspace must retain a member manager';
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'PWR01' THEN
      RETURN 'last_manager';
  END;

  RETURN 'updated';
END;
$$;

REVOKE ALL ON FUNCTION private.update_workspace_default_permissions_guarded(uuid, uuid, text, public.workspace_member_type, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.update_workspace_default_permissions_guarded(uuid, uuid, text, public.workspace_member_type, jsonb)
  TO service_role;

-- The account service checks the snapshot before asking Auth to delete the user.
-- Auth deletion runs in a separate transaction. A concurrent reduction can
-- leave the actor as the sole manager after this snapshot.
-- tuturuuu: reviewed(function-grant) service role; the account service supplies its verified session actor
CREATE FUNCTION private.account_deletion_blocking_workspaces(p_actor_id uuid)
RETURNS TABLE (ws_id uuid, ws_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT w.id, w.name::text
  FROM public.workspace_members actor
  JOIN public.workspaces w ON w.id = actor.ws_id
  WHERE actor.user_id = p_actor_id
    AND actor.type = 'MEMBER'
    AND w.personal IS FALSE
    AND private.workspace_has_member_manager(w.id, p_actor_id)
    AND EXISTS (
      SELECT 1 FROM public.workspace_members other
      WHERE other.ws_id = w.id AND other.type = 'MEMBER'
        AND other.user_id <> p_actor_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.workspace_members other
      WHERE other.ws_id = w.id AND other.type = 'MEMBER'
        AND other.user_id <> p_actor_id
        AND private.workspace_has_member_manager(w.id, other.user_id)
    )
  ORDER BY w.id;
$$;

REVOKE ALL ON FUNCTION private.account_deletion_blocking_workspaces(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.account_deletion_blocking_workspaces(uuid)
  TO service_role;

-- tuturuuu: reviewed(function-grant) service role; read-only platform-admin report with a capped page
CREATE FUNCTION private.list_workspaces_without_member_manager(
  p_after_ws_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  ws_id uuid,
  ws_name text,
  creator_id uuid,
  full_member_count bigint,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH page AS MATERIALIZED (
    SELECT w.id, w.name, w.creator_id, w.created_at
    FROM public.workspaces w
    WHERE w.id >= COALESCE(p_after_ws_id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND w.id IS DISTINCT FROM p_after_ws_id
      AND w.personal IS FALSE
      AND EXISTS (
        SELECT 1 FROM public.workspace_members member
        WHERE member.ws_id = w.id AND member.type = 'MEMBER'
      )
      AND NOT private.workspace_has_member_manager(w.id)
    ORDER BY w.id
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)
  )
  SELECT p.id, p.name::text, p.creator_id, (
    SELECT count(*) FROM public.workspace_members member
    WHERE member.ws_id = p.id AND member.type = 'MEMBER'
  ), p.created_at
  FROM page p
  ORDER BY p.id;
$$;

REVOKE ALL ON FUNCTION private.list_workspaces_without_member_manager(uuid, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.list_workspaces_without_member_manager(uuid, integer)
  TO service_role;
