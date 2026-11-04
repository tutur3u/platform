-- Disposable reduced-schema fixture. Full-chain Supabase acceptance is separate.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA audit;
CREATE TABLE public.workspace_secrets (id int GENERATED ALWAYS AS IDENTITY, name text, value text);
CREATE TABLE audit.policy_test_events (name text);
CREATE FUNCTION audit.insert_update_delete_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
BEGIN INSERT INTO audit.policy_test_events VALUES (coalesce(NEW.name,OLD.name)); RETURN coalesce(NEW,OLD); END $$;
GRANT ALL ON public.workspace_secrets TO anon,authenticated,service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon,authenticated,service_role;
\i apps/database/supabase/migrations/20261029005000_guard_managed_cron_enabled_secret.sql
\i apps/database/supabase/migrations/20261104121600_workspace_ai_policy.sql
DO $$
DECLARE policy_name text; denied boolean;
BEGIN
  FOREACH policy_name IN ARRAY ARRAY['AI_ENABLED','AI_EDUCATION_SCOPE','ENABLE_EDUCATION','MANAGED_CRON_ENABLED'] LOOP
    SET LOCAL ROLE authenticated;
    denied := false;
    BEGIN INSERT INTO public.workspace_secrets(name,value) VALUES(policy_name,'false');
    EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
    RESET ROLE;
    IF NOT denied THEN RAISE EXCEPTION 'authenticated inserted %',policy_name; END IF;
    INSERT INTO public.workspace_secrets(name,value) VALUES(policy_name,'false');
    SET LOCAL ROLE authenticated;
    denied := false;
    BEGIN UPDATE public.workspace_secrets SET name='ordinary' WHERE name=policy_name;
    EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
    RESET ROLE;
    IF NOT denied THEN RAISE EXCEPTION 'authenticated renamed %',policy_name; END IF;
    SET LOCAL ROLE authenticated;
    denied := false;
    BEGIN DELETE FROM public.workspace_secrets WHERE name=policy_name;
    EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
    RESET ROLE;
    IF NOT denied THEN RAISE EXCEPTION 'authenticated deleted %',policy_name; END IF;
  END LOOP;
  IF (SELECT count(*) FROM audit.policy_test_events) <> 3 THEN RAISE EXCEPTION 'policy insert audit missing'; END IF;
  UPDATE public.workspace_secrets SET value='true' WHERE name='AI_ENABLED';
  DELETE FROM public.workspace_secrets WHERE name='AI_ENABLED';
  IF (SELECT count(*) FROM audit.policy_test_events) <> 5 THEN RAISE EXCEPTION 'policy update/delete audit missing'; END IF;
  INSERT INTO public.workspace_secrets(name,value) VALUES('UNRELATED_CREDENTIAL','synthetic');
  IF (SELECT count(*) FROM audit.policy_test_events) <> 5 THEN RAISE EXCEPTION 'unrelated credential audited'; END IF;
  denied := false;
  BEGIN UPDATE public.workspace_secrets SET name='AI_ENABLED',value='false' WHERE name='UNRELATED_CREDENTIAL';
  EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  IF NOT denied THEN RAISE EXCEPTION 'credential rename could copy a secret into policy audit history'; END IF;
END $$;
\echo PASS: 12 reserved-name denials, insert/update/delete audit, unrelated credential excluded
