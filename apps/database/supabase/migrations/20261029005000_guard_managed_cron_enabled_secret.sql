-- MANAGED_CRON_ENABLED is a reserved workspace secret. Server routes change it
-- only after a verified-staff check and then write with the service role.
--
-- * A BEFORE INSERT/UPDATE/DELETE trigger rejects any row change whose old or
--   new name is the reserved name (compared case-insensitively after trimming
--   whitespace, matching the app check) when issued directly by an API role
--   (current_user anon/authenticated). This covers creating, editing, moving,
--   deleting, and renaming to or from the reserved name over PostgREST, even
--   for root-workspace members with manage_workspace_secrets.
-- * The guard keys on current_user alone, so statements that run as another
--   role pass: service-role and migration contexts, and SECURITY DEFINER
--   functions owned by postgres (e.g. the managed cron RPCs). API roles
--   cannot switch current_user, and no session setting relaxes the check.
-- * Other secret names are unaffected.
--
-- Rollback: apps/database/rollbacks/20261029005000_guard_managed_cron_enabled_secret.rollback.sql

-- SECURITY INVOKER on purpose: current_user must reflect the role that issued
-- the statement, so service-role and definer-owned paths are distinguishable
-- from API roles.
CREATE OR REPLACE FUNCTION public.guard_workspace_reserved_secrets()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_reserved constant text := 'MANAGED_CRON_ENABLED';
  v_old_name text;
  v_new_name text;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old_name := upper(
      regexp_replace(OLD.name, '^[[:space:]]+|[[:space:]]+$', '', 'g')
    );
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_name := upper(
      regexp_replace(NEW.name, '^[[:space:]]+|[[:space:]]+$', '', 'g')
    );
  END IF;

  IF v_old_name = v_reserved OR v_new_name = v_reserved THEN
    RAISE EXCEPTION 'Workspace secret % can only be changed by verified staff through the server', v_reserved
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_workspace_reserved_secrets()
FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.guard_workspace_reserved_secrets() IS
  'Rejects anon/authenticated writes to reserved workspace secrets such as MANAGED_CRON_ENABLED.';

DROP TRIGGER IF EXISTS workspace_secrets_guard_reserved_names
ON public.workspace_secrets;

CREATE TRIGGER workspace_secrets_guard_reserved_names
BEFORE INSERT OR UPDATE OR DELETE ON public.workspace_secrets
FOR EACH ROW
EXECUTE FUNCTION public.guard_workspace_reserved_secrets();
