-- Add membership-scoped workspace defaults without changing the guest resource
-- permission model. Existing rows become MEMBER defaults through the column
-- default, and GUEST defaults can coexist for the same permission catalog.

ALTER TABLE public.workspace_default_permissions
ADD COLUMN IF NOT EXISTS member_type public.workspace_member_type NOT NULL DEFAULT 'MEMBER'::public.workspace_member_type;

ALTER TABLE public.workspace_default_permissions
DROP CONSTRAINT IF EXISTS workspace_default_permissions_pkey;

ALTER TABLE public.workspace_default_permissions
ADD CONSTRAINT workspace_default_permissions_pkey
PRIMARY KEY (ws_id, permission, member_type);

CREATE INDEX IF NOT EXISTS workspace_default_permissions_ws_member_type_idx
ON public.workspace_default_permissions USING btree (ws_id, member_type);

COMMENT ON TABLE public.workspace_default_permissions IS
  'Default workspace permissions scoped by workspace member type. MEMBER rows provide member defaults; GUEST rows provide guest defaults. Missing GUEST rows deny access.';

COMMENT ON COLUMN public.workspace_default_permissions.member_type IS
  'Workspace member type this default permission applies to. Existing rows are MEMBER defaults; GUEST defaults are disabled unless explicitly inserted/enabled.';

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM public.workspace_members wsm
  WHERE wsm.ws_id = _org_id
    AND wsm.user_id = _user_id
    AND wsm.type = 'MEMBER'::public.workspace_member_type
);
$function$;

COMMENT ON FUNCTION public.is_org_member(uuid, uuid) IS
  'Returns true only for MEMBER workspace memberships. GUEST memberships are intentionally excluded from member-default/RLS access paths.';

CREATE OR REPLACE FUNCTION public.has_workspace_permission(
  p_ws_id uuid,
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
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
  'Checks member workspace permissions. Priority: 1) workspace creators, 2) MEMBER role/default admin except manage_subscription, 3) MEMBER role/default explicit grants. GUEST defaults are evaluated separately and missing guest rows deny access.';

CREATE OR REPLACE FUNCTION public.initialize_workspace_admin_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.workspace_default_permissions
    (ws_id, permission, member_type, enabled)
  VALUES
    (NEW.id, 'admin', 'MEMBER', true),
    (NEW.id, 'view_drive', 'MEMBER', true),
    (NEW.id, 'manage_drive_tasks_directory', 'MEMBER', true)
  ON CONFLICT (ws_id, permission, member_type) DO UPDATE
  SET enabled = EXCLUDED.enabled;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.initialize_workspace_admin_permission() IS
  'Initializes MEMBER default permissions for newly created workspaces.';

DROP POLICY IF EXISTS "Allow workspace members to create invite links"
ON public.workspace_invite_links;
DROP POLICY IF EXISTS "Allow workspace members to update invite links"
ON public.workspace_invite_links;
DROP POLICY IF EXISTS "Allow workspace members to delete invite links"
ON public.workspace_invite_links;

CREATE POLICY "Allow workspace members to create invite links"
ON public.workspace_invite_links
AS permissive
FOR insert
TO authenticated
WITH CHECK (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
  AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_secrets wss
    WHERE wss.ws_id = workspace_invite_links.ws_id
      AND wss.name = 'DISABLE_INVITE'::text
  )
);

CREATE POLICY "Allow workspace members to update invite links"
ON public.workspace_invite_links
AS permissive
FOR update
TO authenticated
USING (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
)
WITH CHECK (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
);

CREATE POLICY "Allow workspace members to delete invite links"
ON public.workspace_invite_links
AS permissive
FOR delete
TO authenticated
USING (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
);

DROP POLICY IF EXISTS "Workspace members can create workspace guests"
ON public.workspace_guests;
DROP POLICY IF EXISTS "Workspace members can update workspace guests"
ON public.workspace_guests;
DROP POLICY IF EXISTS "Workspace members can delete workspace guests"
ON public.workspace_guests;

CREATE POLICY "Workspace members can create workspace guests"
ON public.workspace_guests
AS permissive
FOR insert
TO authenticated
WITH CHECK (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
);

CREATE POLICY "Workspace members can update workspace guests"
ON public.workspace_guests
AS permissive
FOR update
TO authenticated
USING (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
)
WITH CHECK (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
);

CREATE POLICY "Workspace members can delete workspace guests"
ON public.workspace_guests
AS permissive
FOR delete
TO authenticated
USING (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
);

DROP POLICY IF EXISTS "Workspace members can create workspace guest permissions"
ON public.workspace_guest_permissions;
DROP POLICY IF EXISTS "Workspace members can update workspace guest permissions"
ON public.workspace_guest_permissions;
DROP POLICY IF EXISTS "Workspace members can delete workspace guest permissions"
ON public.workspace_guest_permissions;

CREATE POLICY "Workspace members can create workspace guest permissions"
ON public.workspace_guest_permissions
AS permissive
FOR insert
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workspace_guests wg
    WHERE wg.id = workspace_guest_permissions.guest_id
      AND (
        workspace_guest_permissions.resource_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.workspace_user_groups wug
          WHERE wug.id = workspace_guest_permissions.resource_id
            AND wug.ws_id = wg.ws_id
        )
      )
      AND public.has_workspace_permission(
        wg.ws_id,
        auth.uid(),
        'manage_workspace_members'
      )
  )
);

CREATE POLICY "Workspace members can update workspace guest permissions"
ON public.workspace_guest_permissions
AS permissive
FOR update
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_guests wg
    WHERE wg.id = workspace_guest_permissions.guest_id
      AND (
        workspace_guest_permissions.resource_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.workspace_user_groups wug
          WHERE wug.id = workspace_guest_permissions.resource_id
            AND wug.ws_id = wg.ws_id
        )
      )
      AND public.has_workspace_permission(
        wg.ws_id,
        auth.uid(),
        'manage_workspace_members'
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.workspace_guests wg
    WHERE wg.id = workspace_guest_permissions.guest_id
      AND (
        workspace_guest_permissions.resource_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.workspace_user_groups wug
          WHERE wug.id = workspace_guest_permissions.resource_id
            AND wug.ws_id = wg.ws_id
        )
      )
      AND public.has_workspace_permission(
        wg.ws_id,
        auth.uid(),
        'manage_workspace_members'
      )
  )
);

CREATE POLICY "Workspace members can delete workspace guest permissions"
ON public.workspace_guest_permissions
AS permissive
FOR delete
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.workspace_guests wg
    WHERE wg.id = workspace_guest_permissions.guest_id
      AND public.has_workspace_permission(
        wg.ws_id,
        auth.uid(),
        'manage_workspace_members'
      )
  )
);
