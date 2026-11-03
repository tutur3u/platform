-- tuturuuu: no-grant (trigger)
CREATE OR REPLACE FUNCTION public.guard_workspace_reserved_secrets()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_reserved constant text[] := ARRAY['MANAGED_CRON_ENABLED', 'AI_ENABLED', 'AI_EDUCATION_SCOPE', 'ENABLE_EDUCATION'];
  v_old_name text;
  v_new_name text;
BEGIN
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

  -- Policy audit history must never copy an unrelated credential during a rename.
  IF TG_OP = 'UPDATE' AND
    (v_old_name = ANY(ARRAY['AI_ENABLED', 'AI_EDUCATION_SCOPE', 'ENABLE_EDUCATION']))
      IS DISTINCT FROM
    (v_new_name = ANY(ARRAY['AI_ENABLED', 'AI_EDUCATION_SCOPE', 'ENABLE_EDUCATION'])) THEN
    RAISE EXCEPTION 'Create or delete policy settings instead of renaming credentials to or from them'
      USING ERRCODE = '42501';
  END IF;

  IF current_user NOT IN ('anon', 'authenticated') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF v_old_name = ANY(v_reserved) OR v_new_name = ANY(v_reserved) THEN
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


-- Selective auditing avoids copying unrelated credentials into policy history.
CREATE TRIGGER workspace_ai_policy_audit_insert
AFTER INSERT ON public.workspace_secrets FOR EACH ROW
WHEN (NEW.name IN ('AI_ENABLED', 'AI_EDUCATION_SCOPE', 'ENABLE_EDUCATION'))
EXECUTE FUNCTION audit.insert_update_delete_trigger();
CREATE TRIGGER workspace_ai_policy_audit_update
AFTER UPDATE ON public.workspace_secrets FOR EACH ROW
WHEN (OLD.name IN ('AI_ENABLED', 'AI_EDUCATION_SCOPE', 'ENABLE_EDUCATION') OR NEW.name IN ('AI_ENABLED', 'AI_EDUCATION_SCOPE', 'ENABLE_EDUCATION'))
EXECUTE FUNCTION audit.insert_update_delete_trigger();
CREATE TRIGGER workspace_ai_policy_audit_delete
AFTER DELETE ON public.workspace_secrets FOR EACH ROW
WHEN (OLD.name IN ('AI_ENABLED', 'AI_EDUCATION_SCOPE', 'ENABLE_EDUCATION'))
EXECUTE FUNCTION audit.insert_update_delete_trigger();
