-- Manual rollback only: restores the API write policies on
-- workspace_subscriptions and workspace_orders as they were before
-- 20261028153001, removes the manage_subscription grant guards and restores
-- the invitation role helpers. TRUNCATE, REFERENCES and TRIGGER stay revoked
-- from API roles; the restored policies need only INSERT, UPDATE and DELETE.
BEGIN;

DROP TRIGGER IF EXISTS guard_creator_grant_role_permission
  ON public.workspace_role_permissions;
DROP TRIGGER IF EXISTS guard_creator_grant_default_permission
  ON public.workspace_default_permissions;
DROP TRIGGER IF EXISTS guard_creator_grant_role_member
  ON public.workspace_role_members;
DROP FUNCTION IF EXISTS private.guard_creator_grant_role_permission();
DROP FUNCTION IF EXISTS private.guard_creator_grant_default_permission();
DROP FUNCTION IF EXISTS private.guard_creator_grant_role_member();

GRANT INSERT, UPDATE, DELETE
  ON TABLE public.workspace_subscriptions TO authenticated;
GRANT INSERT, UPDATE, DELETE
  ON TABLE public.workspace_orders TO authenticated;

DROP POLICY IF EXISTS "allow users to create subscriptions"
  ON public.workspace_subscriptions;
CREATE POLICY "allow users to create subscriptions"
  ON public.workspace_subscriptions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));
DROP POLICY IF EXISTS "allow users to edit subscriptions"
  ON public.workspace_subscriptions;
CREATE POLICY "allow users to edit subscriptions"
  ON public.workspace_subscriptions AS PERMISSIVE FOR UPDATE TO authenticated
  USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text))
  WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));
DROP POLICY IF EXISTS "allow users to delete subscriptions"
  ON public.workspace_subscriptions;
CREATE POLICY "allow users to delete subscriptions"
  ON public.workspace_subscriptions AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));

DROP POLICY IF EXISTS "allow users to create orders"
  ON public.workspace_orders;
CREATE POLICY "allow users to create orders"
  ON public.workspace_orders AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));
DROP POLICY IF EXISTS "allow users to update orders"
  ON public.workspace_orders;
CREATE POLICY "allow users to update orders"
  ON public.workspace_orders AS PERMISSIVE FOR UPDATE TO authenticated
  USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text))
  WITH CHECK (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));
DROP POLICY IF EXISTS "allow users to delete orders"
  ON public.workspace_orders;
CREATE POLICY "allow users to delete orders"
  ON public.workspace_orders AS PERMISSIVE FOR DELETE TO authenticated
  USING (has_workspace_permission(ws_id, (select auth.uid()), 'manage_subscription'::text));

-- Invitation role helpers as defined by 20260813024230 and 20260813182000.
DROP FUNCTION IF EXISTS private.set_workspace_invitation_roles(
  uuid, uuid[], uuid, text, uuid
);

CREATE OR REPLACE FUNCTION private.set_workspace_invitation_roles(
  p_ws_id uuid,
  p_role_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_user_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL
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

    DELETE FROM public.workspace_invite_roles wir
    WHERE wir.ws_id = p_ws_id
      AND wir.user_id = p_user_id;

    INSERT INTO public.workspace_invite_roles (ws_id, user_id, role_id)
    SELECT p_ws_id, p_user_id, role_id
    FROM unnest(v_role_ids) AS role_id;

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

    DELETE FROM public.workspace_email_invite_roles weir
    WHERE weir.ws_id = p_ws_id
      AND weir.email = v_email;

    INSERT INTO public.workspace_email_invite_roles (ws_id, email, role_id)
    SELECT p_ws_id, v_email, role_id
    FROM unnest(v_role_ids) AS role_id;

    UPDATE public.workspace_email_invites
    SET role_id = v_role_ids[1]
    WHERE ws_id = p_ws_id
      AND email = v_email;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.set_workspace_invitation_roles(
  uuid, uuid[], uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_workspace_invitation_roles(
  uuid, uuid[], uuid, text
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
    v_email
  );
END;
$$;

REVOKE ALL ON FUNCTION private.create_workspace_email_invitation_with_roles(
  uuid, text, uuid, public.workspace_member_type, uuid[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_workspace_email_invitation_with_roles(
  uuid, text, uuid, public.workspace_member_type, uuid[]
) TO service_role;

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

REVOKE ALL ON FUNCTION private.finalize_workspace_invitation_membership_v2(
  uuid, uuid, public.workspace_member_type, uuid[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.finalize_workspace_invitation_membership_v2(
  uuid, uuid, public.workspace_member_type, uuid[]
) TO service_role;

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

  INSERT INTO public.workspace_email_invite_roles (ws_id, email, role_id)
  VALUES (p_ws_id, v_email, v_role_id);

  RETURN v_setup;
END;
$$;

REVOKE ALL ON FUNCTION private.create_inventory_pos_operator_invite(
  uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.create_inventory_pos_operator_invite(
  uuid, uuid, text
) TO service_role;

CREATE OR REPLACE FUNCTION private.finalize_workspace_invitation_membership(
  p_ws_id uuid,
  p_user_id uuid,
  p_member_type public.workspace_member_type,
  p_role_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_created boolean := false;
  v_existing_type public.workspace_member_type;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat_ws(':', p_ws_id::text, p_user_id::text),
      81427
    )
  );

  IF p_role_id IS NOT NULL THEN
    IF p_member_type <> 'MEMBER'::public.workspace_member_type THEN
      RAISE EXCEPTION 'Workspace roles require member access'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.workspace_roles wr
      WHERE wr.id = p_role_id
        AND wr.ws_id = p_ws_id
    ) THEN
      RAISE EXCEPTION 'The invited workspace role is no longer available'
        USING ERRCODE = '23503';
    END IF;
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
  ELSIF p_member_type = 'MEMBER'::public.workspace_member_type
    AND v_existing_type = 'GUEST'::public.workspace_member_type
  THEN
    UPDATE public.workspace_members
    SET type = 'MEMBER'::public.workspace_member_type
    WHERE ws_id = p_ws_id
      AND user_id = p_user_id;
  END IF;

  IF p_role_id IS NOT NULL THEN
    INSERT INTO public.workspace_role_members (role_id, user_id)
    VALUES (p_role_id, p_user_id)
    ON CONFLICT (role_id, user_id) DO NOTHING;
  END IF;

  RETURN v_created;
END;
$$;

DROP FUNCTION IF EXISTS private.workspace_role_has_creator_grant(uuid);

ALTER TABLE public.workspace_invite_roles
  DROP COLUMN IF EXISTS assigned_by;
ALTER TABLE public.workspace_email_invite_roles
  DROP COLUMN IF EXISTS assigned_by;

COMMIT;
