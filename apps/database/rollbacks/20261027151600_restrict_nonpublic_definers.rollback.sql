-- Security-preserving rollback: audit administration has no client callers.
-- Keep PUBLIC, anon, and authenticated access closed even when reverting D1.
BEGIN;
DO $rollback$
DECLARE obj record; fn record; creator record; schema_owner oid;
BEGIN
  IF to_regnamespace('audit') IS NULL THEN
    RAISE NOTICE 'Skipping absent schema audit';
    RETURN;
  END IF;

  FOR fn IN
    SELECT p.oid, p.proowner
    FROM pg_proc p
    WHERE p.pronamespace = to_regnamespace('audit') AND p.prokind = 'f'
  LOOP
    IF NOT pg_has_role(current_user, fn.proowner, 'MEMBER') THEN
      RAISE NOTICE 'Skipping audit function % owned by non-member role %',
        fn.oid::regprocedure, pg_get_userbyid(fn.proowner);
      CONTINUE;
    END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.oid::regprocedure);
  END LOOP;

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
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', obj.oid::regclass);
    ELSE
      EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC, anon, authenticated', obj.oid::regclass);
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
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA audit REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated', pg_get_userbyid(creator.owner_oid));
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA audit REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated', pg_get_userbyid(creator.owner_oid));
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA audit REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon, authenticated', pg_get_userbyid(creator.owner_oid));
  END LOOP;

  SELECT nspowner INTO schema_owner FROM pg_namespace WHERE nspname = 'audit';
  IF FOUND THEN
    IF pg_has_role(current_user, schema_owner, 'MEMBER') THEN
      REVOKE USAGE ON SCHEMA audit FROM PUBLIC, anon, authenticated;
    ELSE
      RAISE NOTICE 'Skipping audit schema revoke for non-member owner %', pg_get_userbyid(schema_owner);
    END IF;
  END IF;
END;
$rollback$;
COMMIT;
