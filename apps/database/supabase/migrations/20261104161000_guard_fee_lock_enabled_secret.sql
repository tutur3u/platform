BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- The reserved workspace secrets are exactly STAFF_ONLY_WORKSPACE_SECRETS
-- (@tuturuuu/utils/staff-only-workspace-secrets; a test keeps them equal):
-- MANAGED_CRON_ENABLED, ENABLE_BOARD_CYCLES and ENABLE_FEE_LOCK. API roles cannot
-- insert, update, delete or rename to/from them; server routes change them after a
-- verified-staff check with the service role. Same trigger as 20261029005000.
-- Rollback: apps/database/rollbacks/20261104161000_guard_fee_lock_enabled_secret.rollback.sql

-- SECURITY INVOKER on purpose: current_user must reflect the issuing role.
CREATE OR REPLACE FUNCTION public.guard_workspace_reserved_secrets()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_reserved constant text[] := ARRAY['MANAGED_CRON_ENABLED', 'ENABLE_BOARD_CYCLES', 'ENABLE_FEE_LOCK'];
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
    v_old_name := upper(regexp_replace(OLD.name, '^[[:space:]]+|[[:space:]]+$', '', 'g'));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_name := upper(regexp_replace(NEW.name, '^[[:space:]]+|[[:space:]]+$', '', 'g'));
  END IF;

  IF v_old_name = ANY (v_reserved) OR v_new_name = ANY (v_reserved) THEN
    RAISE EXCEPTION 'Workspace secret % can only be changed by verified staff through the server',
      CASE WHEN v_new_name = ANY (v_reserved) THEN v_new_name ELSE v_old_name END
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
  'Rejects anon/authenticated writes to reserved workspace secrets (MANAGED_CRON_ENABLED, ENABLE_BOARD_CYCLES, ENABLE_FEE_LOCK).';

COMMIT;
