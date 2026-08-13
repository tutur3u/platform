CREATE OR REPLACE FUNCTION private.finalize_workspace_invitation_membership(
  p_ws_id uuid,
  p_user_id uuid,
  p_member_type public.workspace_member_type,
  p_role_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

REVOKE ALL ON FUNCTION private.finalize_workspace_invitation_membership(
  uuid,
  uuid,
  public.workspace_member_type,
  uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.finalize_workspace_invitation_membership(
  uuid,
  uuid,
  public.workspace_member_type,
  uuid
) TO service_role;
