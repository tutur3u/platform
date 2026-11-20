-- Trigger inventory (latest callers):
--   private.notify_time_tracking_request_submitted()
--   private.notify_time_tracking_request_status_change()
--   private.handle_report_approval()
--   private.handle_post_approval()
--   public.enforce_workspace_member_type_update()
--   private.check_time_tracking_request_update()
--   private.assign_project_ticket_key()
--   private.protect_project_ticket_identity()
-- The first two evaluate notification recipients; the remaining callers use
-- the authenticated actor. The creator-grant guards in this migration call
-- public.is_workspace_owner, not this helper.
--
-- manage_courses is a creator-grant permission: the workspace creator holds it
-- and can delegate it through a workspace role. Admin and default permissions
-- never imply it.
--
-- public.has_workspace_permission starts from the body in
-- 20261121141020_mira_operator_permission_evaluator.sql (manage_mastermind and
-- operate_mira_channels explicit grants) and adds the manage_courses branch.
-- private.update_workspace_role_guarded and
-- private.update_workspace_default_permissions_guarded start from the bodies in
-- 20261122104000_enforce_workspace_manager_postcondition.sql and treat
-- manage_courses like the other creator-grant permission.
alter type public.workspace_role_permission add value if not exists 'manage_courses';

CREATE OR REPLACE FUNCTION public.has_workspace_permission(
  p_ws_id uuid,
  p_user_id uuid,
  p_permission text
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

  -- Explicit-grant permission: only membership of the recorded root role.
  -- Creator, admin and default permissions never imply it.
  IF p_permission = 'manage_mastermind' THEN
    RETURN p_ws_id = '00000000-0000-0000-0000-000000000000'::uuid
      AND public.is_org_member(p_user_id, p_ws_id)
      AND EXISTS (
        SELECT 1
        FROM public.workspace_role_members wrm
        JOIN public.workspace_roles wr
          ON wr.id = wrm.role_id
         AND wr.ws_id = p_ws_id
        JOIN public.workspace_role_permissions wrp
          ON wrp.role_id = wrm.role_id
         AND wrp.ws_id = p_ws_id
        JOIN private.mastermind_access_role mar
          ON mar.role_id = wrm.role_id
        WHERE wrm.user_id = p_user_id
          AND wrp.permission::text = 'manage_mastermind'
          AND wrp.enabled = true
      );
  END IF;

  -- Explicit-grant permission: only an enabled grant on a root role the user
  -- holds. Creator, admin and default permissions never imply it.
  IF p_permission = 'operate_mira_channels' THEN
    RETURN p_ws_id = '00000000-0000-0000-0000-000000000000'::uuid
      AND public.is_org_member(p_user_id, p_ws_id)
      AND EXISTS (
        SELECT 1
        FROM public.workspace_role_members wrm
        JOIN public.workspace_roles wr
          ON wr.id = wrm.role_id
         AND wr.ws_id = p_ws_id
        JOIN public.workspace_role_permissions wrp
          ON wrp.role_id = wrm.role_id
         AND wrp.ws_id = p_ws_id
        WHERE wrm.user_id = p_user_id
          AND wrp.permission::text = 'operate_mira_channels'
          AND wrp.enabled = true
      );
  END IF;

  -- Workspace creators keep full workspace access.
  IF EXISTS (
    SELECT 1
    FROM public.workspaces
    WHERE id = p_ws_id
      AND creator_id = p_user_id
  ) THEN
    RETURN true;
  END IF;

  -- Default and role workspace permissions are member-only. Guests use the
  -- guest default evaluator in application code, plus workspace_guest_permissions
  -- for resource-scoped grants such as course access.
  IF NOT public.is_org_member(p_user_id, p_ws_id) THEN
    RETURN false;
  END IF;

  -- Course managers are delegated through a workspace role by the creator.
  IF p_permission = 'manage_courses' THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.workspace_role_members rm
      JOIN public.workspace_role_permissions rp
        ON rp.role_id = rm.role_id AND rp.ws_id = p_ws_id
      WHERE rm.user_id = p_user_id
        AND rp.permission::text = 'manage_courses'
        AND rp.enabled
    );
  END IF;

  -- Admin grants all member permissions except manage_subscription.
  IF p_permission != 'manage_subscription' AND EXISTS (
    SELECT 1
    FROM public.workspace_role_members wrm
    JOIN public.workspace_role_permissions wrp
      ON wrp.role_id = wrm.role_id
     AND wrp.ws_id = p_ws_id
    WHERE wrm.user_id = p_user_id
      AND wrp.permission = 'admin'::public.workspace_role_permission
      AND wrp.enabled = true

    UNION

    SELECT 1
    FROM public.workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.permission = 'admin'::public.workspace_role_permission
      AND wdp.member_type = 'MEMBER'::public.workspace_member_type
      AND wdp.enabled = true
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.workspace_role_members wrm
    JOIN public.workspace_role_permissions wrp
      ON wrp.role_id = wrm.role_id
     AND wrp.ws_id = p_ws_id
    WHERE wrm.user_id = p_user_id
      AND wrp.permission = p_permission::public.workspace_role_permission
      AND wrp.enabled = true

    UNION

    SELECT 1
    FROM public.workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.permission = p_permission::public.workspace_role_permission
      AND wdp.member_type = 'MEMBER'::public.workspace_member_type
      AND wdp.enabled = true
  );
END;
$$;

COMMENT ON FUNCTION public.has_workspace_permission(uuid, uuid, text) IS
  'Checks member workspace permissions. Priority: 0) manage_mastermind only via membership of the recorded root Mastermind role, and operate_mira_channels only via an enabled root role grant, 1) workspace creators, 2) manage_courses only via an enabled role grant held by a member, 3) MEMBER role/default admin except manage_subscription, 4) MEMBER role/default explicit grants. GUEST defaults are evaluated separately and missing guest rows deny access.';

-- PUBLIC-role policies (changelog, settings, suspensions) evaluate this
-- function, so PUBLIC keeps EXECUTE alongside each API role.
REVOKE ALL ON FUNCTION public.has_workspace_permission(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.has_workspace_permission(uuid,uuid,text) anon-required review=https://github.com/tutur3u/platform/pull/7178
GRANT EXECUTE ON FUNCTION public.has_workspace_permission(uuid, uuid, text) TO PUBLIC, anon, authenticated, service_role;

-- tuturuuu: no-grant (trigger)
CREATE OR REPLACE FUNCTION private.guard_creator_grant_role_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user IN ('authenticated', 'anon')
      AND OLD.permission::text = 'manage_courses'
      AND NOT public.is_workspace_owner(OLD.ws_id, auth.uid())
    THEN
      RAISE EXCEPTION 'only the workspace creator can remove a course manager grant'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.permission::text = 'manage_courses'
      AND NOT public.is_workspace_owner(NEW.ws_id, auth.uid())
    THEN
      RAISE EXCEPTION 'only the workspace creator can set a course manager grant'
        USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.permission::text = 'manage_courses'
      AND NOT public.is_workspace_owner(OLD.ws_id, auth.uid())
    THEN
      RAISE EXCEPTION 'only the workspace creator can move a course manager grant'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF current_user NOT IN ('authenticated', 'anon')
    OR NEW.permission::text <> 'manage_subscription'
    OR NOT NEW.enabled THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.enabled
    AND OLD.permission = NEW.permission
    AND OLD.role_id = NEW.role_id
    AND OLD.ws_id = NEW.ws_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1
    FROM public.workspace_role_permissions wrp
    WHERE wrp.ws_id = NEW.ws_id
      AND wrp.role_id = NEW.role_id
      AND wrp.permission = NEW.permission
      AND wrp.enabled
  ) THEN
    -- BEFORE INSERT runs before ON CONFLICT resolves the existing grant.
    RETURN NEW;
  END IF;

  IF NOT public.is_workspace_owner(NEW.ws_id, auth.uid()) THEN
    RAISE EXCEPTION 'only the workspace creator can grant manage_subscription'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

revoke all on function private.guard_creator_grant_role_permission()
  from public, anon, authenticated, service_role;
drop trigger if exists guard_creator_grant_role_permission on public.workspace_role_permissions;
create trigger guard_creator_grant_role_permission
  before insert or update or delete on public.workspace_role_permissions
  for each row execute function private.guard_creator_grant_role_permission();

-- tuturuuu: no-grant (trigger)
CREATE OR REPLACE FUNCTION private.guard_creator_grant_default_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.permission::text = 'manage_courses' THEN
    RAISE EXCEPTION 'course managers must be assigned through a workspace role'
      USING ERRCODE = '42501';
  END IF;

  IF current_user NOT IN ('authenticated', 'anon')
    OR NEW.permission::text <> 'manage_subscription'
    OR NOT NEW.enabled THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.enabled
    AND OLD.permission = NEW.permission
    AND OLD.member_type = NEW.member_type
    AND OLD.ws_id = NEW.ws_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND EXISTS (
    SELECT 1
    FROM public.workspace_default_permissions wdp
    WHERE wdp.ws_id = NEW.ws_id
      AND wdp.member_type = NEW.member_type
      AND wdp.permission = NEW.permission
      AND wdp.enabled
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_workspace_owner(NEW.ws_id, auth.uid()) THEN
    RAISE EXCEPTION 'only the workspace creator can grant manage_subscription'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

revoke all on function private.guard_creator_grant_default_permission()
  from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.workspace_role_creator_grants_owned_by_actor(
  p_role_id uuid,
  p_actor_id uuid,
  p_include_disabled boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_roles wr
    WHERE wr.id = p_role_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_role_permissions wrp
    LEFT JOIN public.workspaces w ON w.id = wrp.ws_id
    WHERE wrp.role_id = p_role_id
      AND (
        wrp.permission::text = 'manage_courses'
        OR (wrp.permission::text = 'manage_subscription' AND (p_include_disabled OR wrp.enabled))
      )
      AND w.creator_id IS DISTINCT FROM p_actor_id
  );
$$;

revoke all on function private.workspace_role_creator_grants_owned_by_actor(uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function private.workspace_role_creator_grants_owned_by_actor(uuid, uuid, boolean)
  to service_role;

CREATE OR REPLACE FUNCTION private.workspace_role_has_creator_grant(
  p_role_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_role_permissions wrp
    WHERE wrp.role_id = p_role_id
      AND (
        wrp.permission::text = 'manage_courses'
        OR (wrp.permission::text = 'manage_subscription' AND wrp.enabled)
      )
  );
$$;

revoke all on function private.workspace_role_has_creator_grant(uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.workspace_role_has_creator_grant(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.can_rename_creator_grant_role(
  p_role_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_actor_id IS NOT DISTINCT FROM auth.uid()
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.workspace_role_permissions wrp
        WHERE wrp.role_id = p_role_id
          AND wrp.permission::text IN ('manage_subscription', 'manage_courses')
      )
      OR (
        EXISTS (
          SELECT 1
          FROM public.workspace_roles wr
          JOIN public.workspace_members wm
            ON wm.ws_id = wr.ws_id
           AND wm.user_id = auth.uid()
          WHERE wr.id = p_role_id
        )
        AND private.workspace_role_creator_grants_owned_by_actor(p_role_id, p_actor_id, true)
      )
    );
$$;

revoke all on function public.can_rename_creator_grant_role(uuid, uuid)
  from public, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.can_rename_creator_grant_role(uuid,uuid) review=https://github.com/tutur3u/platform/pull/7206
grant execute on function public.can_rename_creator_grant_role(uuid, uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.prepare_inventory_pos_operator_access(
  p_ws_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_admin_role_id uuid;
  v_default_admin_enabled boolean := false;
  v_member_count integer := 0;
  v_pos_role_id uuid;
  v_preserved_member_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = p_ws_id AND w.personal = false
  ) THEN
    RAISE EXCEPTION 'Workspace is not available for POS operator setup';
  END IF;

  IF NOT (
    public.has_workspace_permission(p_ws_id, p_actor_id, 'manage_workspace_members')
    AND public.has_workspace_permission(p_ws_id, p_actor_id, 'manage_workspace_roles')
  ) THEN
    RAISE EXCEPTION 'Workspace member and role management permissions are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_ws_id::text));

  SELECT EXISTS (
    SELECT 1 FROM public.workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.member_type = 'MEMBER'
      AND wdp.permission = 'admin'
      AND wdp.enabled = true
  ) INTO v_default_admin_enabled;

  SELECT count(*)::integer
  FROM public.workspace_members wm
  WHERE wm.ws_id = p_ws_id AND wm.type = 'MEMBER'
  INTO v_member_count;

  IF v_default_admin_enabled THEN
    SELECT wr.id INTO v_admin_role_id
    FROM public.workspace_roles wr
    WHERE wr.ws_id = p_ws_id
      AND wr.name = 'Workspace Admin (preserved)'
    ORDER BY wr.created_at ASC
    LIMIT 1;

    IF v_admin_role_id IS NULL THEN
      INSERT INTO public.workspace_roles (name, ws_id)
      VALUES ('Workspace Admin (preserved)', p_ws_id)
      RETURNING id INTO v_admin_role_id;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.workspace_role_permissions wrp
      WHERE wrp.role_id = v_admin_role_id
        AND wrp.permission::text IN ('manage_subscription', 'manage_courses')
    ) THEN
      RAISE EXCEPTION
        'name-selected preserved admin role has a creator-grant permission'
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.workspace_role_permissions (enabled, permission, role_id, ws_id)
    VALUES (true, 'admin', v_admin_role_id, p_ws_id)
    ON CONFLICT (ws_id, permission, role_id) DO UPDATE SET enabled = true;

    INSERT INTO public.workspace_role_members (role_id, user_id)
    SELECT v_admin_role_id, wm.user_id
    FROM public.workspace_members wm
    WHERE wm.ws_id = p_ws_id AND wm.type = 'MEMBER'
    ON CONFLICT (role_id, user_id) DO NOTHING;

    GET DIAGNOSTICS v_preserved_member_count = ROW_COUNT;

    UPDATE public.workspace_default_permissions
    SET enabled = false
    WHERE ws_id = p_ws_id
      AND member_type = 'MEMBER'
      AND permission = 'admin'
      AND enabled = true;
  END IF;

  SELECT wr.id INTO v_pos_role_id
  FROM public.workspace_roles wr
  WHERE wr.ws_id = p_ws_id AND wr.name = 'POS Operator'
  ORDER BY wr.created_at ASC
  LIMIT 1;

  IF v_pos_role_id IS NULL THEN
    INSERT INTO public.workspace_roles (name, ws_id)
    VALUES ('POS Operator', p_ws_id)
    RETURNING id INTO v_pos_role_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_role_permissions wrp
    WHERE wrp.role_id = v_pos_role_id
      AND wrp.permission::text IN ('manage_subscription', 'manage_courses')
  ) THEN
    RAISE EXCEPTION
      'name-selected POS operator role has a creator-grant permission'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.workspace_role_permissions
  WHERE role_id = v_pos_role_id
    AND permission <> 'initiate_pos_checkout';

  INSERT INTO public.workspace_role_permissions (enabled, permission, role_id, ws_id)
  VALUES (true, 'initiate_pos_checkout', v_pos_role_id, p_ws_id)
  ON CONFLICT (ws_id, permission, role_id) DO UPDATE SET enabled = true;

  RETURN jsonb_build_object(
    'adminRoleId', v_admin_role_id,
    'defaultAdminWasDisabled', v_default_admin_enabled,
    'memberCount', v_member_count,
    'posOperatorRoleId', v_pos_role_id,
    'preservedMemberCount', v_preserved_member_count
  );
END;
$$;

revoke all on function private.prepare_inventory_pos_operator_access(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function private.prepare_inventory_pos_operator_access(uuid, uuid) to service_role;

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
      AND (v_is_creator OR edits.id NOT IN ('manage_subscription', 'manage_courses'))
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
    -- Course managers are delegated through workspace roles only.
    WHERE edits.id NOT IN ('manage_mastermind', 'operate_mira_channels', 'manage_courses')
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
