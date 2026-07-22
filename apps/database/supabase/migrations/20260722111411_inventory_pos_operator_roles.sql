ALTER TABLE public.workspace_email_invites
ADD COLUMN IF NOT EXISTS role_id uuid
REFERENCES public.workspace_roles(id) ON DELETE SET NULL;

ALTER TABLE public.workspace_invites
ADD COLUMN IF NOT EXISTS role_id uuid
REFERENCES public.workspace_roles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.workspace_email_invites.role_id IS
  'Optional least-privilege role assigned when the email invite is accepted.';

COMMENT ON COLUMN public.workspace_invites.role_id IS
  'Optional least-privilege role assigned when the direct invite is accepted.';

CREATE OR REPLACE FUNCTION private.prepare_inventory_pos_operator_access(
  p_ws_id uuid,
  p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_role_id uuid;
  v_default_admin_enabled boolean := false;
  v_member_count integer := 0;
  v_pos_role_id uuid;
  v_preserved_member_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspaces w
    WHERE w.id = p_ws_id
      AND w.personal = false
  ) THEN
    RAISE EXCEPTION 'Workspace is not available for POS operator setup';
  END IF;

  IF NOT (
    public.has_workspace_permission(
      p_ws_id,
      p_actor_id,
      'manage_workspace_members'
    )
    AND public.has_workspace_permission(
      p_ws_id,
      p_actor_id,
      'manage_workspace_roles'
    )
  ) THEN
    RAISE EXCEPTION 'Workspace member and role management permissions are required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_ws_id::text));

  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_default_permissions wdp
    WHERE wdp.ws_id = p_ws_id
      AND wdp.member_type = 'MEMBER'
      AND wdp.permission = 'admin'
      AND wdp.enabled = true
  )
  INTO v_default_admin_enabled;

  SELECT count(*)::integer
  FROM public.workspace_members wm
  WHERE wm.ws_id = p_ws_id
    AND wm.type = 'MEMBER'
  INTO v_member_count;

  IF v_default_admin_enabled THEN
    SELECT wr.id
    FROM public.workspace_roles wr
    WHERE wr.ws_id = p_ws_id
      AND wr.name = 'Workspace Admin (preserved)'
    ORDER BY wr.created_at ASC
    LIMIT 1
    INTO v_admin_role_id;

    IF v_admin_role_id IS NULL THEN
      INSERT INTO public.workspace_roles (name, ws_id)
      VALUES ('Workspace Admin (preserved)', p_ws_id)
      RETURNING id INTO v_admin_role_id;
    END IF;

    INSERT INTO public.workspace_role_permissions (
      enabled,
      permission,
      role_id,
      ws_id
    )
    VALUES (true, 'admin', v_admin_role_id, p_ws_id)
    ON CONFLICT (ws_id, permission, role_id)
    DO UPDATE SET enabled = true;

    INSERT INTO public.workspace_role_members (role_id, user_id)
    SELECT v_admin_role_id, wm.user_id
    FROM public.workspace_members wm
    WHERE wm.ws_id = p_ws_id
      AND wm.type = 'MEMBER'
    ON CONFLICT (role_id, user_id) DO NOTHING;

    GET DIAGNOSTICS v_preserved_member_count = ROW_COUNT;

    UPDATE public.workspace_default_permissions
    SET enabled = false
    WHERE ws_id = p_ws_id
      AND member_type = 'MEMBER'
      AND permission = 'admin'
      AND enabled = true;
  END IF;

  SELECT wr.id
  FROM public.workspace_roles wr
  WHERE wr.ws_id = p_ws_id
    AND wr.name = 'POS Operator'
  ORDER BY wr.created_at ASC
  LIMIT 1
  INTO v_pos_role_id;

  IF v_pos_role_id IS NULL THEN
    INSERT INTO public.workspace_roles (name, ws_id)
    VALUES ('POS Operator', p_ws_id)
    RETURNING id INTO v_pos_role_id;
  END IF;

  DELETE FROM public.workspace_role_permissions
  WHERE role_id = v_pos_role_id
    AND permission <> 'initiate_pos_checkout';

  INSERT INTO public.workspace_role_permissions (
    enabled,
    permission,
    role_id,
    ws_id
  )
  VALUES (true, 'initiate_pos_checkout', v_pos_role_id, p_ws_id)
  ON CONFLICT (ws_id, permission, role_id)
  DO UPDATE SET enabled = true;

  RETURN jsonb_build_object(
    'adminRoleId', v_admin_role_id,
    'defaultAdminWasDisabled', v_default_admin_enabled,
    'memberCount', v_member_count,
    'posOperatorRoleId', v_pos_role_id,
    'preservedMemberCount', v_preserved_member_count
  );
END;
$$;

REVOKE ALL ON FUNCTION private.prepare_inventory_pos_operator_access(uuid, uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.prepare_inventory_pos_operator_access(uuid, uuid)
TO service_role;
