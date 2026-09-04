CREATE UNIQUE INDEX IF NOT EXISTS workspace_roles_ws_id_id_key
ON public.workspace_roles (ws_id, id);

CREATE TABLE IF NOT EXISTS public.workspace_invite_roles (
  ws_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ws_id, user_id, role_id),
  FOREIGN KEY (ws_id, user_id)
    REFERENCES public.workspace_invites (ws_id, user_id)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (ws_id, role_id)
    REFERENCES public.workspace_roles (ws_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.workspace_email_invite_roles (
  ws_id uuid NOT NULL,
  email text NOT NULL,
  role_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ws_id, email, role_id),
  FOREIGN KEY (ws_id, email)
    REFERENCES public.workspace_email_invites (ws_id, email)
    ON UPDATE CASCADE ON DELETE CASCADE,
  FOREIGN KEY (ws_id, role_id)
    REFERENCES public.workspace_roles (ws_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE
);

ALTER TABLE public.workspace_invite_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_email_invite_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.workspace_invite_roles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.workspace_email_invite_roles FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.workspace_invite_roles TO service_role;
GRANT ALL ON public.workspace_email_invite_roles TO service_role;

INSERT INTO public.workspace_invite_roles (ws_id, user_id, role_id)
SELECT wi.ws_id, wi.user_id, wi.role_id
FROM public.workspace_invites wi
WHERE wi.role_id IS NOT NULL
ON CONFLICT (ws_id, user_id, role_id) DO NOTHING;

INSERT INTO public.workspace_email_invite_roles (ws_id, email, role_id)
SELECT wei.ws_id, wei.email, wei.role_id
FROM public.workspace_email_invites wei
WHERE wei.role_id IS NOT NULL
ON CONFLICT (ws_id, email, role_id) DO NOTHING;

COMMENT ON TABLE public.workspace_invite_roles IS
  'Workspace roles assigned to a pending direct user invitation.';
COMMENT ON TABLE public.workspace_email_invite_roles IS
  'Workspace roles assigned to a pending email invitation.';
COMMENT ON COLUMN public.workspace_invites.role_id IS
  'Compatibility mirror of the first pending role. Multi-role assignments live in workspace_invite_roles.';
COMMENT ON COLUMN public.workspace_email_invites.role_id IS
  'Compatibility mirror of the first pending role. Multi-role assignments live in workspace_email_invite_roles.';

CREATE OR REPLACE FUNCTION private.set_workspace_invitation_roles(
  p_ws_id uuid,
  p_role_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_user_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

CREATE OR REPLACE FUNCTION private.list_workspace_invitation_role_ids(
  p_ws_id uuid
)
RETURNS TABLE (email text, user_id uuid, role_ids uuid[])
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    NULL::text AS email,
    wi.user_id,
    CASE
      WHEN count(wir.role_id) > 0
        THEN array_agg(wir.role_id ORDER BY wr.name, wir.role_id)
      WHEN wi.role_id IS NOT NULL THEN ARRAY[wi.role_id]
      ELSE ARRAY[]::uuid[]
    END AS role_ids
  FROM public.workspace_invites wi
  LEFT JOIN public.workspace_invite_roles wir
    ON wir.ws_id = wi.ws_id
    AND wir.user_id = wi.user_id
  LEFT JOIN public.workspace_roles wr ON wr.id = wir.role_id
  WHERE wi.ws_id = p_ws_id
  GROUP BY wi.ws_id, wi.user_id, wi.role_id

  UNION ALL

  SELECT
    wei.email,
    NULL::uuid AS user_id,
    CASE
      WHEN count(weir.role_id) > 0
        THEN array_agg(weir.role_id ORDER BY wr.name, weir.role_id)
      WHEN wei.role_id IS NOT NULL THEN ARRAY[wei.role_id]
      ELSE ARRAY[]::uuid[]
    END AS role_ids
  FROM public.workspace_email_invites wei
  LEFT JOIN public.workspace_email_invite_roles weir
    ON weir.ws_id = wei.ws_id
    AND weir.email = wei.email
  LEFT JOIN public.workspace_roles wr ON wr.id = weir.role_id
  WHERE wei.ws_id = p_ws_id
  GROUP BY wei.ws_id, wei.email, wei.role_id;
$$;

REVOKE ALL ON FUNCTION private.list_workspace_invitation_role_ids(uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.list_workspace_invitation_role_ids(uuid)
TO service_role;

CREATE OR REPLACE FUNCTION private.get_workspace_invitation_role_ids(
  p_ws_id uuid,
  p_user_id uuid DEFAULT NULL,
  p_email text DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (
      SELECT listed.role_ids
      FROM private.list_workspace_invitation_role_ids(p_ws_id) listed
      WHERE (p_user_id IS NOT NULL AND listed.user_id = p_user_id)
        OR (
          p_user_id IS NULL
          AND p_email IS NOT NULL
          AND listed.email = lower(trim(p_email))
        )
      LIMIT 1
    ),
    ARRAY[]::uuid[]
  );
$$;

REVOKE ALL ON FUNCTION private.get_workspace_invitation_role_ids(
  uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_workspace_invitation_role_ids(
  uuid, uuid, text
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
SET search_path = ''
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
SET search_path = ''
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
SET search_path = ''
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
