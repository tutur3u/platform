BEGIN;
SET LOCAL lock_timeout = '5s';
-- Rollback order: 131100 -> 131000 -> 130950 -> 130100 -> 130000.
-- Drop the composite FK in 131000 before the quarantine rollback (130950).

DROP TRIGGER workspace_roles_ws_id_immutable ON public.workspace_roles;
DROP TRIGGER prevent_workspace_role_creator_grant_rename ON public.workspace_roles;
ALTER TABLE public.workspace_role_permissions DROP CONSTRAINT workspace_role_permissions_ws_role_fkey;
-- Restore the FK from 20240626191436_add_workspace_role_permissions.sql;
ALTER TABLE public.workspace_role_permissions ADD CONSTRAINT public_workspace_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.workspace_roles(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
ALTER TABLE public.workspace_role_permissions VALIDATE CONSTRAINT public_workspace_role_permissions_role_id_fkey;
-- The separate public_workspace_role_permissions_ws_id_fkey was never dropped.

-- Restore definition from 20261029012100_restrict_subscription_writes.sql
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

DROP FUNCTION private.prevent_workspace_role_creator_grant_rename();
DROP FUNCTION public.can_rename_creator_grant_role(uuid, uuid);
DROP FUNCTION public.can_add_creator_grant_role_member(uuid, uuid);
DROP FUNCTION private.workspace_role_creator_grants_owned_by_actor(uuid, uuid);
DROP FUNCTION private.workspace_role_creator_grants_owned_by_actor(uuid, uuid, boolean);
DROP FUNCTION private.prevent_workspace_role_workspace_change();



COMMIT;
