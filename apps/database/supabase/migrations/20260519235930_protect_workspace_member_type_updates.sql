-- Harden workspace membership type against self-service escalation.
--
-- Guests and ordinary members must not be able to update their own
-- workspace_members.type row into MEMBER. Manager updates still go through the
-- normal manage_workspace_members permission path, and service-role server
-- maintenance remains available for controlled admin flows.

DROP POLICY IF EXISTS "Allow workspace managers to update members"
ON public.workspace_members;

CREATE POLICY "Allow workspace managers to update members"
ON public.workspace_members
AS permissive
FOR update
TO authenticated
USING (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
)
WITH CHECK (
  public.has_workspace_permission(ws_id, auth.uid(), 'manage_workspace_members')
);

CREATE OR REPLACE FUNCTION public.enforce_workspace_member_type_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.type IS NOT DISTINCT FROM OLD.type THEN
    RETURN NEW;
  END IF;

  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_workspace_permission(
    OLD.ws_id,
    auth.uid(),
    'manage_workspace_members'
  ) THEN
    RAISE EXCEPTION 'Only workspace managers can change workspace member type'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workspace_members_enforce_type_update
ON public.workspace_members;

CREATE TRIGGER workspace_members_enforce_type_update
BEFORE UPDATE ON public.workspace_members
FOR EACH ROW
EXECUTE FUNCTION public.enforce_workspace_member_type_update();

COMMENT ON FUNCTION public.enforce_workspace_member_type_update() IS
  'Prevents non-manager authenticated callers from changing workspace_members.type; service-role maintenance remains available for server-controlled admin flows.';
