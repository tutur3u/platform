-- Moving a role to another workspace keeps its role memberships, so the move
-- is refused for every database role, owners and service_role included, while
-- any of its members lacks a MEMBER row in the destination workspace. API
-- roles still cannot change workspace_roles.ws_id at all. No audited move
-- path exists; a deliberate move first makes each holder a MEMBER of the
-- destination or removes their role membership.

-- tuturuuu: no-grant (trigger)
CREATE OR REPLACE FUNCTION private.prevent_workspace_role_workspace_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW.ws_id IS NOT DISTINCT FROM OLD.ws_id THEN
    RETURN NEW;
  END IF;

  IF current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'workspace_roles.ws_id cannot be changed by API roles'
      USING ERRCODE = '42501';
  END IF;

  -- Lock the holders' destination memberships so a concurrent removal or
  -- demotion waits for the move and then ends the moved role memberships.
  PERFORM 1
  FROM public.workspace_members wm
  JOIN public.workspace_role_members wrm ON wrm.user_id = wm.user_id
  WHERE wrm.role_id = OLD.id
    AND wm.ws_id = NEW.ws_id
  FOR SHARE OF wm;

  IF EXISTS (
    SELECT 1
    FROM public.workspace_role_members wrm
    WHERE wrm.role_id = OLD.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.workspace_members wm
        WHERE wm.ws_id = NEW.ws_id
          AND wm.user_id = wrm.user_id
          AND wm.type = 'MEMBER'::public.workspace_member_type
      )
  ) THEN
    RAISE EXCEPTION 'workspace_roles.ws_id cannot move a role whose holders are not members of the destination workspace'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_workspace_role_workspace_change()
  FROM PUBLIC, anon, authenticated, service_role;
