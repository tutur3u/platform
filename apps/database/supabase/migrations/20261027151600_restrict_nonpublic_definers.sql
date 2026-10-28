BEGIN;
-- Audit administration has no first-party client callers. Keep service access
-- intact while removing PUBLIC and client access where this role can act.
DO $definers$
DECLARE fn record; service_access boolean;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proowner
    FROM pg_proc p
    WHERE p.pronamespace = to_regnamespace('audit')
      AND p.prokind = 'f' AND p.prosecdef
  LOOP
    IF NOT pg_has_role(current_user, fn.proowner, 'MEMBER') THEN
      RAISE NOTICE 'Skipping audit function % owned by non-member role %',
        fn.oid::regprocedure, pg_get_userbyid(fn.proowner);
      CONTINUE;
    END IF;
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
DECLARE obj record; creator record;
BEGIN
  IF to_regnamespace('audit') IS NULL THEN
    RAISE NOTICE 'Skipping absent schema audit';
    RETURN;
  END IF;

  FOR obj IN
    SELECT c.oid, c.relowner, c.relkind
    FROM pg_class c
    WHERE c.relnamespace = to_regnamespace('audit')
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  LOOP
    IF NOT pg_has_role(current_user, obj.relowner, 'MEMBER') THEN
      RAISE NOTICE 'Skipping audit object % owned by non-member role %',
        obj.oid::regclass, pg_get_userbyid(obj.relowner);
      CONTINUE;
    END IF;
    IF obj.relkind = 'S' THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', obj.oid::regclass);
    ELSE
      EXECUTE format('REVOKE ALL ON TABLE %s FROM anon, authenticated', obj.oid::regclass);
    END IF;
  END LOOP;

  FOR creator IN
    SELECT DISTINCT owner_oid
    FROM (
      SELECT nspowner AS owner_oid FROM pg_namespace WHERE nspname = 'audit'
      UNION SELECT p.proowner FROM pg_proc p WHERE p.pronamespace = to_regnamespace('audit')
      UNION SELECT c.relowner FROM pg_class c WHERE c.relnamespace = to_regnamespace('audit')
      UNION SELECT d.defaclrole FROM pg_default_acl d WHERE d.defaclnamespace = to_regnamespace('audit')
    ) owners
  LOOP
    IF NOT pg_has_role(current_user, creator.owner_oid, 'MEMBER') THEN
      RAISE NOTICE 'Skipping audit default privileges for non-member role %',
        pg_get_userbyid(creator.owner_oid);
      CONTINUE;
    END IF;
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA audit REVOKE ALL ON TABLES FROM anon, authenticated',
      pg_get_userbyid(creator.owner_oid)
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA audit REVOKE ALL ON SEQUENCES FROM anon, authenticated',
      pg_get_userbyid(creator.owner_oid)
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA audit REVOKE ALL ON FUNCTIONS FROM anon, authenticated',
      pg_get_userbyid(creator.owner_oid)
    );
  END LOOP;

  SELECT nspowner INTO creator FROM pg_namespace WHERE nspname = 'audit';
  IF FOUND THEN
    IF pg_has_role(current_user, creator.nspowner, 'MEMBER') THEN
      REVOKE USAGE ON SCHEMA audit FROM anon, authenticated;
    ELSE
      RAISE NOTICE 'Skipping audit schema revoke for non-member owner %',
        pg_get_userbyid(creator.nspowner);
    END IF;
  END IF;
  IF has_schema_privilege('anon', 'audit', 'USAGE')
    OR has_schema_privilege('authenticated', 'audit', 'USAGE') THEN
    RAISE EXCEPTION 'Audit schema still permits client access';
  END IF;
END;
$audit$;

DO $legacy$
DECLARE fn oid; owner_oid oid; service_access boolean; authenticated_access boolean;
BEGIN
  SELECT p.oid, p.proowner INTO fn, owner_oid
  FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.validate_cross_app_token(text,text)');
  IF fn IS NULL THEN
    RAISE NOTICE 'Skipping absent legacy cross-app validator';
    RETURN;
  END IF;
  IF NOT pg_has_role(current_user, owner_oid, 'MEMBER') THEN
    RAISE NOTICE 'Skipping legacy cross-app validator owned by non-member role %',
      pg_get_userbyid(owner_oid);
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
