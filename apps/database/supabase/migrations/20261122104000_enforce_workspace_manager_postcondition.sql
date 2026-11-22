SET LOCAL lock_timeout = '5s';

-- tuturuuu: no-grant (internal)
CREATE FUNCTION private.require_read_committed()
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_isolation text := pg_catalog.current_setting('transaction_isolation');
BEGIN
  IF v_isolation IS DISTINCT FROM 'read committed' THEN
    RAISE SQLSTATE '25000' USING MESSAGE =
      pg_catalog.format('Guarded workspace operations require READ COMMITTED (found %s)', v_isolation);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.require_read_committed()
  FROM PUBLIC, anon, authenticated, service_role;

-- tuturuuu: no-grant (internal)
CREATE OR REPLACE FUNCTION private.workspace_lost_member_manager(p_ws_id uuid, p_had_manager boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.ws_id = p_ws_id AND wm.type = 'MEMBER'
  )
    AND NOT private.workspace_has_member_manager(p_ws_id);
$$;

REVOKE ALL ON FUNCTION private.workspace_lost_member_manager(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.workspace_lost_member_manager(uuid, boolean) IS $rule$
Postcondition. No guarded operation may finish leaving a workspace with at least one full member and no member manager, whatever the state was before the operation. An operation is allowed when, after it, the workspace has a member manager, or has no full member.
One exception, self-departure. A person removing their own membership from a workspace that ALREADY had no member manager before the operation is allowed. It cannot make the workspace worse, and nobody may be trapped in a workspace they cannot leave. Under the membership rule, the last member manager cannot leave while other full members remain. A departure leaving no full member is allowed.
p_had_manager is ignored and retained for call compatibility. The member-removal routines apply the self-departure exception.
$rule$;

-- tuturuuu: reviewed(function-grant) service role; workspace actor and membership checks are retained
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
  PERFORM private.require_read_committed();
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

    IF private.workspace_lost_member_manager(p_ws_id, v_had_manager)
      -- A self-departure cannot make an already-managerless workspace lose a manager.
      AND NOT (p_user_id IS NOT DISTINCT FROM p_actor_id AND NOT v_had_manager)
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
  'Under the membership rule, the last member manager cannot leave while other full members remain. A departure leaving no full member is allowed. Self-departure is allowed when the workspace already had no member manager. External apps cannot remove themselves. p_guard_self has no effect and is retained for call compatibility.';

-- tuturuuu: reviewed(function-grant) service role; CMS actor checks are retained
CREATE OR REPLACE FUNCTION public.remove_workspace_member_guarded(
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
  PERFORM private.require_read_committed();
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

    -- Legacy CMS also refuses losing a manager when no full member remains.
    IF (CASE
      WHEN v_had_manager THEN NOT private.workspace_has_member_manager(p_ws_id)
      ELSE private.workspace_lost_member_manager(p_ws_id, v_had_manager)
    END)
      -- A self-departure cannot make an already-managerless workspace lose a manager.
      AND NOT (p_user_id IS NOT DISTINCT FROM p_actor_id AND NOT v_had_manager)
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

REVOKE ALL ON FUNCTION public.remove_workspace_member_guarded(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.remove_workspace_member_guarded(uuid, uuid, uuid)
  TO service_role;

COMMENT ON FUNCTION public.remove_workspace_member_guarded(uuid, uuid, uuid) IS
  'Under the membership rule, the last member manager cannot leave while other full members remain. A departure leaving no full member is allowed under the shared postcondition. Legacy CMS permits own departure from an already-managerless workspace and also refuses loss of an existing manager when no full member would remain.';

-- tuturuuu: reviewed(function-grant) service role; CMS actor checks and role ownership are retained
CREATE OR REPLACE FUNCTION public.remove_workspace_role_member_guarded(
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
  PERFORM private.require_read_committed();
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

    -- Legacy CMS also refuses losing a manager when no full member remains.
    IF (CASE
      WHEN v_had_manager THEN NOT private.workspace_has_member_manager(p_ws_id)
      ELSE private.workspace_lost_member_manager(p_ws_id, v_had_manager)
    END) THEN
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

COMMENT ON FUNCTION public.remove_workspace_role_member_guarded(uuid, uuid, uuid, uuid) IS
  'CMS role membership removal enforces the manager floor. Loss of an existing manager is also refused when no full member would remain.';

-- tuturuuu: reviewed(function-grant) service role; workspace and CMS role authorization are retained
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
  PERFORM private.require_read_committed();
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

-- tuturuuu: reviewed(function-grant) service role; workspace and CMS role authorization are retained
CREATE OR REPLACE FUNCTION public.delete_workspace_role_guarded(
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
  PERFORM private.require_read_committed();
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

-- tuturuuu: reviewed(function-grant) service role; external-app actor and target checks are retained
CREATE OR REPLACE FUNCTION public.reduce_external_app_workspace_admin_guarded(
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
  PERFORM private.require_read_committed();
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

-- tuturuuu: reviewed(function-grant) service role; actor authorization and role ownership are rechecked under the removal lock
CREATE OR REPLACE FUNCTION private.update_workspace_role_guarded(
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
  PERFORM private.require_read_committed();
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
CREATE OR REPLACE FUNCTION private.update_workspace_default_permissions_guarded(
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
  PERFORM private.require_read_committed();
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

COMMENT ON FUNCTION private.account_deletion_blocking_workspaces(uuid) IS
  'Best-effort preflight using a snapshot read. The Auth service deletes the account in a separate transaction. A concurrent removal or second account deletion in that race window can still leave full members without a member manager. Platform-operator deletion does not call this function.';

COMMENT ON FUNCTION private.list_workspaces_without_member_manager(uuid, integer) IS
  'Read-only report of shared workspaces with full members and no member manager. Guarded edits and removals must retain a manager or leave no full members. Self-departure is allowed from an already-managerless workspace. The report performs no automatic repair.';
