-- Billing state is written only by the service role (Polar webhooks, sync
-- jobs and server routes using the admin client). Members holding
-- manage_subscription keep read access through the existing SELECT policies.
--
-- manage_subscription is not implied by admin (see has_workspace_permission),
-- so only the workspace creator may enable it on a role or default
-- permission, or add members to a role that holds it.

-- 1. workspace_subscriptions: read-only for API users.
DROP POLICY IF EXISTS "allow users to create subscriptions"
  ON public.workspace_subscriptions;
DROP POLICY IF EXISTS "allow users to edit subscriptions"
  ON public.workspace_subscriptions;
DROP POLICY IF EXISTS "allow users to delete subscriptions"
  ON public.workspace_subscriptions;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.workspace_subscriptions FROM anon, authenticated;

-- 2. workspace_orders: read-only for API users.
DROP POLICY IF EXISTS "allow users to create orders"
  ON public.workspace_orders;
DROP POLICY IF EXISTS "allow users to update orders"
  ON public.workspace_orders;
DROP POLICY IF EXISTS "allow users to delete orders"
  ON public.workspace_orders;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.workspace_orders FROM anon, authenticated;

-- 3. Creator-only grants of manage_subscription.
--
-- The guards run as the invoker so current_user identifies direct API writes
-- (authenticated/anon). The service role and vetted SECURITY DEFINER routines
-- run as other roles and are not checked here. Disabling and deleting stay
-- open; re-saving an already enabled grant is not a new grant.
CREATE OR REPLACE FUNCTION private.guard_creator_grant_role_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION private.guard_creator_grant_default_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION private.guard_creator_grant_role_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_ws_id uuid;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.role_id = NEW.role_id
    AND OLD.user_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT wr.ws_id INTO v_ws_id
  FROM public.workspace_roles wr
  WHERE wr.id = NEW.role_id;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_role_permissions wrp
    WHERE wrp.role_id = NEW.role_id
      AND wrp.permission::text = 'manage_subscription'
      AND wrp.enabled
  ) AND (
    v_ws_id IS NULL
    OR NOT public.is_workspace_owner(v_ws_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'only the workspace creator can add members to a role with manage_subscription'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_creator_grant_role_permission()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_creator_grant_default_permission()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.guard_creator_grant_role_member()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_creator_grant_role_permission
  ON public.workspace_role_permissions;
CREATE TRIGGER guard_creator_grant_role_permission
  BEFORE INSERT OR UPDATE ON public.workspace_role_permissions
  FOR EACH ROW EXECUTE FUNCTION private.guard_creator_grant_role_permission();

DROP TRIGGER IF EXISTS guard_creator_grant_default_permission
  ON public.workspace_default_permissions;
CREATE TRIGGER guard_creator_grant_default_permission
  BEFORE INSERT OR UPDATE ON public.workspace_default_permissions
  FOR EACH ROW EXECUTE FUNCTION private.guard_creator_grant_default_permission();

DROP TRIGGER IF EXISTS guard_creator_grant_role_member
  ON public.workspace_role_members;
CREATE TRIGGER guard_creator_grant_role_member
  BEFORE INSERT OR UPDATE ON public.workspace_role_members
  FOR EACH ROW EXECUTE FUNCTION private.guard_creator_grant_role_member();

-- 4. Creator-only invitation roles.
--
-- Invitation helpers run as SECURITY DEFINER, so the role member guard above
-- does not see them. Pending invitation roles record who assigned them, and
-- both assigning and accepting check that a role holding manage_subscription
-- was assigned by the workspace creator.
ALTER TABLE public.workspace_invite_roles
  ADD COLUMN IF NOT EXISTS assigned_by uuid;
ALTER TABLE public.workspace_email_invite_roles
  ADD COLUMN IF NOT EXISTS assigned_by uuid;

COMMENT ON COLUMN public.workspace_invite_roles.assigned_by IS
  'User who assigned this role to the pending invitation.';
COMMENT ON COLUMN public.workspace_email_invite_roles.assigned_by IS
  'User who assigned this role to the pending invitation.';

-- Email invitations already record their sender; direct invitations do not,
-- so their pending roles keep no assigner.
UPDATE public.workspace_email_invite_roles weir
SET assigned_by = wei.invited_by
FROM public.workspace_email_invites wei
WHERE wei.ws_id = weir.ws_id
  AND wei.email = weir.email
  AND weir.assigned_by IS NULL;

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
      AND wrp.permission::text = 'manage_subscription'
      AND wrp.enabled
  );
$$;

REVOKE ALL ON FUNCTION private.workspace_role_has_creator_grant(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.workspace_role_has_creator_grant(uuid)
  TO service_role;

DROP FUNCTION IF EXISTS private.set_workspace_invitation_roles(
  uuid, uuid[], uuid, text
);

-- Roles already on the invitation keep their original assigner, so an edit
-- by another manager neither drops nor re-attributes a creator grant.
CREATE OR REPLACE FUNCTION private.set_workspace_invitation_roles(
  p_ws_id uuid,
  p_role_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_user_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_invitation_type public.workspace_member_type;
  v_role_ids uuid[];
BEGIN
  IF (p_user_id IS NULL) = (v_email IS NULL OR v_email = '') THEN
    RAISE EXCEPTION 'Expected exactly one invitation identifier'
      USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(array_agg(role_id ORDER BY role_id), ARRAY[]::uuid[])
  INTO v_role_ids
  FROM (
    SELECT DISTINCT role_id
    FROM unnest(coalesce(p_role_ids, ARRAY[]::uuid[])) AS role_id
    WHERE role_id IS NOT NULL
  ) normalized_roles;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_role_ids) AS requested_role_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.workspace_roles wr
      WHERE wr.ws_id = p_ws_id
        AND wr.id = requested_role_id
    )
  ) THEN
    RAISE EXCEPTION 'A selected workspace role is not available'
      USING ERRCODE = '23503';
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT wi.type
    INTO v_invitation_type
    FROM public.workspace_invites wi
    WHERE wi.ws_id = p_ws_id
      AND wi.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pending workspace invitation not found'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_invitation_type <> 'MEMBER' AND cardinality(v_role_ids) > 0 THEN
      RAISE EXCEPTION 'Workspace roles require member access'
        USING ERRCODE = '22023';
    END IF;

    IF NOT public.is_workspace_owner(p_ws_id, p_actor_id) AND EXISTS (
      SELECT 1
      FROM unnest(v_role_ids) AS requested_role_id
      WHERE private.workspace_role_has_creator_grant(requested_role_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.workspace_invite_roles wir
          WHERE wir.ws_id = p_ws_id
            AND wir.user_id = p_user_id
            AND wir.role_id = requested_role_id
        )
    ) THEN
      RAISE EXCEPTION 'only the workspace creator can assign a role with manage_subscription'
        USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.workspace_invite_roles wir
    WHERE wir.ws_id = p_ws_id
      AND wir.user_id = p_user_id
      AND wir.role_id <> ALL (v_role_ids);

    INSERT INTO public.workspace_invite_roles (
      ws_id, user_id, role_id, assigned_by
    )
    SELECT p_ws_id, p_user_id, role_id, p_actor_id
    FROM unnest(v_role_ids) AS role_id
    ON CONFLICT (ws_id, user_id, role_id) DO NOTHING;

    UPDATE public.workspace_invites
    SET role_id = v_role_ids[1]
    WHERE ws_id = p_ws_id
      AND user_id = p_user_id;
  ELSE
    SELECT wei.type
    INTO v_invitation_type
    FROM public.workspace_email_invites wei
    WHERE wei.ws_id = p_ws_id
      AND wei.email = v_email
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pending workspace invitation not found'
        USING ERRCODE = 'P0002';
    END IF;

    IF v_invitation_type <> 'MEMBER' AND cardinality(v_role_ids) > 0 THEN
      RAISE EXCEPTION 'Workspace roles require member access'
        USING ERRCODE = '22023';
    END IF;

    IF NOT public.is_workspace_owner(p_ws_id, p_actor_id) AND EXISTS (
      SELECT 1
      FROM unnest(v_role_ids) AS requested_role_id
      WHERE private.workspace_role_has_creator_grant(requested_role_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.workspace_email_invite_roles weir
          WHERE weir.ws_id = p_ws_id
            AND weir.email = v_email
            AND weir.role_id = requested_role_id
        )
    ) THEN
      RAISE EXCEPTION 'only the workspace creator can assign a role with manage_subscription'
        USING ERRCODE = '42501';
    END IF;

    DELETE FROM public.workspace_email_invite_roles weir
    WHERE weir.ws_id = p_ws_id
      AND weir.email = v_email
      AND weir.role_id <> ALL (v_role_ids);

    INSERT INTO public.workspace_email_invite_roles (
      ws_id, email, role_id, assigned_by
    )
    SELECT p_ws_id, v_email, role_id, p_actor_id
    FROM unnest(v_role_ids) AS role_id
    ON CONFLICT (ws_id, email, role_id) DO NOTHING;

    UPDATE public.workspace_email_invites
    SET role_id = v_role_ids[1]
    WHERE ws_id = p_ws_id
      AND email = v_email;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.set_workspace_invitation_roles(
  uuid, uuid[], uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_workspace_invitation_roles(
  uuid, uuid[], uuid, text, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION private.create_workspace_email_invitation_with_roles(
  p_ws_id uuid,
  p_email text,
  p_invited_by uuid,
  p_member_type public.workspace_member_type,
  p_role_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(p_email));
BEGIN
  INSERT INTO public.workspace_email_invites (
    ws_id,
    email,
    invited_by,
    role_id,
    type
  ) VALUES (
    p_ws_id,
    v_email,
    p_invited_by,
    NULL,
    p_member_type
  );

  PERFORM private.set_workspace_invitation_roles(
    p_ws_id,
    p_role_ids,
    NULL,
    v_email,
    p_invited_by
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.create_inventory_pos_operator_invite(
  p_ws_id uuid,
  p_actor_id uuid,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_role_id uuid;
  v_setup jsonb;
BEGIN
  v_setup := private.prepare_inventory_pos_operator_access(p_ws_id, p_actor_id);
  v_role_id := (v_setup ->> 'posOperatorRoleId')::uuid;

  INSERT INTO public.workspace_email_invites (
    email,
    invited_by,
    role_id,
    type,
    ws_id
  ) VALUES (v_email, p_actor_id, v_role_id, 'MEMBER', p_ws_id);

  INSERT INTO public.workspace_email_invite_roles (
    ws_id, email, role_id, assigned_by
  )
  VALUES (p_ws_id, v_email, v_role_id, p_actor_id);

  RETURN v_setup;
END;
$$;

-- Accepting an invitation adds a role holding manage_subscription only when
-- the user already holds it or the creator assigned it to the pending
-- invitation. The caller-supplied role list is never trusted on its own.
CREATE OR REPLACE FUNCTION private.finalize_workspace_invitation_membership_v2(
  p_ws_id uuid,
  p_user_id uuid,
  p_member_type public.workspace_member_type,
  p_role_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_created boolean := false;
  v_existing_type public.workspace_member_type;
  v_role_ids uuid[];
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(':', p_ws_id::text, p_user_id::text),
      81427
    )
  );

  SELECT coalesce(array_agg(role_id ORDER BY role_id), ARRAY[]::uuid[])
  INTO v_role_ids
  FROM (
    SELECT DISTINCT role_id
    FROM unnest(coalesce(p_role_ids, ARRAY[]::uuid[])) AS role_id
    WHERE role_id IS NOT NULL
  ) normalized_roles;

  IF p_member_type <> 'MEMBER' AND cardinality(v_role_ids) > 0 THEN
    RAISE EXCEPTION 'Workspace roles require member access'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_role_ids) AS requested_role_id
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.workspace_roles wr
      WHERE wr.ws_id = p_ws_id
        AND wr.id = requested_role_id
    )
  ) THEN
    RAISE EXCEPTION 'An invited workspace role is no longer available'
      USING ERRCODE = '23503';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(v_role_ids) AS requested_role_id
    WHERE private.workspace_role_has_creator_grant(requested_role_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.workspace_role_members wrm
        WHERE wrm.role_id = requested_role_id
          AND wrm.user_id = p_user_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.workspace_invite_roles wir
        WHERE wir.ws_id = p_ws_id
          AND wir.user_id = p_user_id
          AND wir.role_id = requested_role_id
          AND public.is_workspace_owner(p_ws_id, wir.assigned_by)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.workspace_email_invite_roles weir
        JOIN auth.users au
          ON lower(au.email) = weir.email
        WHERE au.id = p_user_id
          AND weir.ws_id = p_ws_id
          AND weir.role_id = requested_role_id
          AND public.is_workspace_owner(p_ws_id, weir.assigned_by)
      )
  ) THEN
    RAISE EXCEPTION 'only the workspace creator can assign a role with manage_subscription'
      USING ERRCODE = '42501';
  END IF;

  SELECT wm.type
  INTO v_existing_type
  FROM public.workspace_members wm
  WHERE wm.ws_id = p_ws_id
    AND wm.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.workspace_members (ws_id, user_id, type)
    VALUES (p_ws_id, p_user_id, p_member_type)
    ON CONFLICT (ws_id, user_id) DO NOTHING;
    v_created := FOUND;
  ELSIF p_member_type = 'MEMBER' AND v_existing_type = 'GUEST' THEN
    UPDATE public.workspace_members
    SET type = 'MEMBER'
    WHERE ws_id = p_ws_id
      AND user_id = p_user_id;
  END IF;

  INSERT INTO public.workspace_role_members (role_id, user_id)
  SELECT role_id, p_user_id
  FROM unnest(v_role_ids) AS role_id
  ON CONFLICT (role_id, user_id) DO NOTHING;

  RETURN v_created;
END;
$$;

-- The single-role finalizer predates multi-role invitations; route it
-- through the checked path so it cannot assign roles on its own.
CREATE OR REPLACE FUNCTION private.finalize_workspace_invitation_membership(
  p_ws_id uuid,
  p_user_id uuid,
  p_member_type public.workspace_member_type,
  p_role_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT private.finalize_workspace_invitation_membership_v2(
    p_ws_id,
    p_user_id,
    p_member_type,
    CASE
      WHEN p_role_id IS NULL THEN ARRAY[]::uuid[]
      ELSE ARRAY[p_role_id]
    END
  );
$$;
