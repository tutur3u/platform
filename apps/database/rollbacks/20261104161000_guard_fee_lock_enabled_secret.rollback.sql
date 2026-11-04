-- Rollback: 20261104161000_guard_fee_lock_enabled_secret.sql
--
-- Restores the 20261029005000 guard body (only MANAGED_CRON_ENABLED reserved);
-- ENABLE_FEE_LOCK is then guarded only by the app-level verified-staff check.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

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

-- tuturuuu: no-grant (trigger)
REVOKE ALL ON FUNCTION public.guard_workspace_reserved_secrets()
FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.guard_workspace_reserved_secrets() IS
  'Rejects anon/authenticated writes to reserved workspace secrets such as MANAGED_CRON_ENABLED.';

COMMIT;
