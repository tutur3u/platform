BEGIN;
-- Audit administration has no first-party client callers. Preserve existing
-- service access while revoking PUBLIC and both explicit client grants.
DO $definers$
DECLARE fn record; service_access boolean;
BEGIN
  FOR fn IN
    SELECT p.oid FROM pg_proc p
    WHERE p.pronamespace = to_regnamespace('audit')
      AND p.prokind = 'f' AND p.prosecdef
  LOOP
    service_access := has_function_privilege('service_role', fn.oid, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.oid::regprocedure);
    IF has_function_privilege('anon', fn.oid, 'EXECUTE')
      OR has_function_privilege('authenticated', fn.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Cannot restrict audit function %', fn.oid::regprocedure;
    END IF;
    IF service_access AND NOT has_function_privilege('service_role', fn.oid, 'EXECUTE') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.oid::regprocedure);
    END IF;
  END LOOP;
END;
$definers$;

DO $audit$
DECLARE creator record; object_type text;
BEGIN
  IF to_regnamespace('audit') IS NOT NULL THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA audit FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA audit FROM anon, authenticated;
    FOR creator IN
      SELECT pg_get_userbyid(owner_oid) AS name FROM (
        SELECT nspowner AS owner_oid FROM pg_namespace WHERE nspname = 'audit'
        UNION SELECT p.proowner FROM pg_proc p WHERE p.pronamespace = to_regnamespace('audit')
        UNION SELECT c.relowner FROM pg_class c WHERE c.relnamespace = to_regnamespace('audit')
        UNION SELECT d.defaclrole FROM pg_default_acl d WHERE d.defaclnamespace = to_regnamespace('audit')
      ) owners
    LOOP
      FOREACH object_type IN ARRAY ARRAY['TABLES', 'SEQUENCES', 'FUNCTIONS'] LOOP
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA audit REVOKE ALL ON %s FROM anon, authenticated', creator.name, object_type);
      END LOOP;
    END LOOP;
  ELSE
    RAISE NOTICE 'Skipping absent schema audit';
  END IF;
  IF to_regnamespace('audit') IS NOT NULL THEN
    REVOKE USAGE ON SCHEMA audit FROM anon, authenticated;
    IF has_schema_privilege('anon', 'audit', 'USAGE')
      OR has_schema_privilege('authenticated', 'audit', 'USAGE') THEN
      RAISE EXCEPTION 'Audit schema still permits client access';
    END IF;
  END IF;
END;
$audit$;

DO $legacy$
DECLARE fn oid; service_access boolean; authenticated_access boolean;
BEGIN
  fn := to_regprocedure('public.validate_cross_app_token(text,text)');
  IF fn IS NULL THEN
    RAISE NOTICE 'Skipping absent legacy cross-app validator';
    RETURN;
  END IF;
  service_access := has_function_privilege('service_role', fn, 'EXECUTE');
  authenticated_access := has_function_privilege('authenticated', fn, 'EXECUTE');
  EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn::regprocedure);
  IF service_access AND NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn::regprocedure);
  END IF;
  IF authenticated_access AND NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn::regprocedure);
  END IF;
  IF has_function_privilege('anon', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Legacy cross-app validator still permits anon execution';
  END IF;
END;
$legacy$;

COMMIT;
