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
  v_setup jsonb;
BEGIN
  v_setup := private.prepare_inventory_pos_operator_access(
    p_ws_id,
    p_actor_id
  );

  INSERT INTO public.workspace_email_invites (
    email,
    invited_by,
    role_id,
    type,
    ws_id
  )
  VALUES (
    lower(trim(p_email)),
    p_actor_id,
    (v_setup ->> 'posOperatorRoleId')::uuid,
    'MEMBER',
    p_ws_id
  );

  RETURN v_setup;
END;
$$;

REVOKE ALL ON FUNCTION private.create_inventory_pos_operator_invite(
  uuid,
  uuid,
  text
)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.create_inventory_pos_operator_invite(
  uuid,
  uuid,
  text
)
TO service_role;
