BEGIN;

-- Keep the workspace key on a role aligned with its permission rows and keep
-- creator-granted role membership tied to every workspace that owns a grant.
-- Bound the ACCESS EXCLUSIVE lock on the hot RLS table (security review, sync packet M4).
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';


ALTER TABLE public.workspace_role_permissions
  DROP CONSTRAINT IF EXISTS public_workspace_role_permissions_role_id_fkey;

-- tuturuuu: reviewed(dynamic-sql-review): static catalog guard, fixed identifiers, no caller input; rerun-safe ADD NOT VALID (VALIDATE runs in its own transaction at the end)
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint
  WHERE conname = 'workspace_role_permissions_ws_role_fkey'
    AND conrelid = 'public.workspace_role_permissions'::regclass) THEN
  ALTER TABLE public.workspace_role_permissions
    ADD CONSTRAINT workspace_role_permissions_ws_role_fkey
    FOREIGN KEY (ws_id, role_id) REFERENCES public.workspace_roles (ws_id, id)
    ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
END IF; END $$;


-- tuturuuu: no-grant (trigger)
CREATE OR REPLACE FUNCTION private.prevent_workspace_role_workspace_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated')
    AND NEW.ws_id IS DISTINCT FROM OLD.ws_id
  THEN
    RAISE EXCEPTION 'workspace_roles.ws_id cannot be changed by API roles'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_workspace_role_workspace_change()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS workspace_roles_ws_id_immutable
  ON public.workspace_roles;
CREATE TRIGGER workspace_roles_ws_id_immutable
  BEFORE UPDATE OF ws_id ON public.workspace_roles
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_workspace_role_workspace_change();

CREATE OR REPLACE FUNCTION private.workspace_role_creator_grants_owned_by_actor(
  p_role_id uuid,
  p_actor_id uuid,
  p_include_disabled boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_roles wr
    WHERE wr.id = p_role_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_role_permissions wrp
    LEFT JOIN public.workspaces w ON w.id = wrp.ws_id
    WHERE wrp.role_id = p_role_id
      AND wrp.permission::text = 'manage_subscription'
      AND (p_include_disabled OR wrp.enabled)
      AND w.creator_id IS DISTINCT FROM p_actor_id
  );
$$;

REVOKE ALL ON FUNCTION private.workspace_role_creator_grants_owned_by_actor(uuid, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.workspace_role_creator_grants_owned_by_actor(uuid, uuid, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION private.workspace_role_creator_grants_owned_by_actor(
  p_role_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT private.workspace_role_creator_grants_owned_by_actor(p_role_id, p_actor_id, false);
$$;

REVOKE ALL ON FUNCTION private.workspace_role_creator_grants_owned_by_actor(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.workspace_role_creator_grants_owned_by_actor(uuid, uuid)
  TO service_role;

-- This narrow wrapper lets the invoker trigger check the protected helper
-- without granting the helper itself to API roles.
CREATE OR REPLACE FUNCTION public.can_add_creator_grant_role_member(
  p_role_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_actor_id IS NOT DISTINCT FROM auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.workspace_roles wr
      JOIN public.workspace_members wm
        ON wm.ws_id = wr.ws_id
       AND wm.user_id = auth.uid()
      WHERE wr.id = p_role_id
    )
    AND private.workspace_role_creator_grants_owned_by_actor(p_role_id, p_actor_id);
$$;

REVOKE ALL ON FUNCTION public.can_add_creator_grant_role_member(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.can_add_creator_grant_role_member(uuid,uuid) review=https://github.com/tutur3u/platform/pull/7206
GRANT EXECUTE ON FUNCTION public.can_add_creator_grant_role_member(uuid, uuid)
  TO authenticated;

-- The rename trigger relies on this definer check rather than caller-visible
-- rows. Roles without manage_subscription rows may be renamed; otherwise the
-- actor must be a member and the creator of every workspace holding them.
CREATE OR REPLACE FUNCTION public.can_rename_creator_grant_role(
  p_role_id uuid,
  p_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT p_actor_id IS NOT DISTINCT FROM auth.uid()
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.workspace_role_permissions wrp
        WHERE wrp.role_id = p_role_id
          AND wrp.permission::text = 'manage_subscription'
      )
      OR (
        EXISTS (
          SELECT 1
          FROM public.workspace_roles wr
          JOIN public.workspace_members wm
            ON wm.ws_id = wr.ws_id
           AND wm.user_id = auth.uid()
          WHERE wr.id = p_role_id
        )
        AND private.workspace_role_creator_grants_owned_by_actor(p_role_id, p_actor_id, true)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.can_rename_creator_grant_role(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
-- tuturuuu: reviewed(function-grant): public.can_rename_creator_grant_role(uuid,uuid) review=https://github.com/tutur3u/platform/pull/7206
GRANT EXECUTE ON FUNCTION public.can_rename_creator_grant_role(uuid, uuid)
  TO authenticated;

-- tuturuuu: no-grant (trigger)
CREATE OR REPLACE FUNCTION private.guard_creator_grant_role_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.role_id = NEW.role_id
    AND OLD.user_id = NEW.user_id
  THEN
    RETURN NEW;
  END IF;

  IF NOT public.can_add_creator_grant_role_member(NEW.role_id, auth.uid()) THEN
    RAISE EXCEPTION
      'only a creator of every workspace holding this role grant can add members'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_creator_grant_role_member()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_creator_grant_role_member
  ON public.workspace_role_members;
CREATE TRIGGER guard_creator_grant_role_member
  BEFORE INSERT OR UPDATE ON public.workspace_role_members
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_creator_grant_role_member();

-- tuturuuu: no-grant (trigger)
CREATE OR REPLACE FUNCTION private.prevent_workspace_role_creator_grant_rename()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.name IS DISTINCT FROM OLD.name
      AND NOT public.can_rename_creator_grant_role(OLD.id, auth.uid())
    THEN
      RAISE EXCEPTION
        'this API caller cannot rename the workspace role'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_workspace_role_creator_grant_rename()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS prevent_workspace_role_creator_grant_rename
  ON public.workspace_roles;
CREATE TRIGGER prevent_workspace_role_creator_grant_rename
  BEFORE UPDATE OF name ON public.workspace_roles
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_workspace_role_creator_grant_rename();

COMMIT;

-- Validate separately: a failed VALIDATE leaves the NOT VALID FK in place and
-- the whole file stays safe to rerun.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';
ALTER TABLE public.workspace_role_permissions
  VALIDATE CONSTRAINT workspace_role_permissions_ws_role_fkey;
COMMIT;
