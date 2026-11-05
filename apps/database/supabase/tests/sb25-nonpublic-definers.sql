BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

CREATE TEMP VIEW sb25_targets AS
SELECT p.oid, p.proowner, n.nspname, p.proacl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'audit' AND p.prokind = 'f' AND p.prosecdef;

SELECT ok(to_regprocedure('audit.disable_tracking(regclass)') IS NOT NULL,
  'audit tracking control is covered');
SELECT ok(NOT has_function_privilege(role_name, oid, 'EXECUTE'),
  format('%s cannot execute %s', role_name, oid::regprocedure))
FROM sb25_targets CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS role_name;
SELECT ok(NOT EXISTS (
  SELECT FROM aclexplode(coalesce(proacl, acldefault('f', proowner))) a
  WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
), format('PUBLIC cannot execute %s', oid::regprocedure)) FROM sb25_targets;
SELECT ok(has_function_privilege('service_role', oid, 'EXECUTE'),
  format('service_role retains %s', oid::regprocedure))
FROM sb25_targets;
SELECT ok(has_function_privilege(proowner, oid, 'EXECUTE'),
  format('owner retains %s', oid::regprocedure)) FROM sb25_targets;

SELECT ok(NOT has_table_privilege(role_name, c.oid,
  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'),
  format('%s has no table privileges on %s', role_name, c.oid::regclass))
FROM pg_class c CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS role_name
WHERE c.relnamespace = to_regnamespace('audit') AND c.relkind IN ('r','p','v','m','f');
SELECT ok(NOT has_sequence_privilege(role_name, c.oid, 'USAGE,SELECT,UPDATE'),
  format('%s has no sequence privileges on %s', role_name, c.oid::regclass))
FROM pg_class c CROSS JOIN unnest(ARRAY['anon', 'authenticated']) AS role_name
WHERE c.relnamespace = to_regnamespace('audit') AND c.relkind = 'S';
SELECT ok(NOT EXISTS (
  SELECT FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE d.defaclnamespace = to_regnamespace('audit')
    AND d.defaclobjtype IN ('r','S','f')
    AND a.grantee IN ('anon'::regrole, 'authenticated'::regrole)
), 'audit defaults contain no client grants for any creator');

-- Exercise every recorded creator. A preserves global authenticated function
-- defaults; schema-local REVOKE cannot subtract those, so schema USAGE also gates access.
SELECT lives_ok($defaults$
DO $probe$
DECLARE creator record;
BEGIN
  FOR creator IN
    SELECT pg_get_userbyid(owner_oid) AS name FROM (
      SELECT nspowner AS owner_oid FROM pg_namespace WHERE nspname = 'audit'
      UNION SELECT proowner FROM pg_proc WHERE pronamespace = to_regnamespace('audit')
      UNION SELECT relowner FROM pg_class WHERE relnamespace = to_regnamespace('audit')
      UNION SELECT defaclrole FROM pg_default_acl WHERE defaclnamespace = to_regnamespace('audit')
    ) owners
  LOOP
    EXECUTE format('SET LOCAL ROLE %I', creator.name);
    CREATE TABLE audit.sb25_default_table (id integer);
    CREATE SEQUENCE audit.sb25_default_sequence;
    EXECUTE 'CREATE FUNCTION audit.sb25_default_function() RETURNS integer LANGUAGE sql AS ''SELECT 1''';
    RESET ROLE;
    IF EXISTS (SELECT FROM pg_class c CROSS JOIN unnest(ARRAY['anon','authenticated']) role_name
      WHERE c.oid = 'audit.sb25_default_table'::regclass
        AND has_table_privilege(role_name, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN'))
      OR has_sequence_privilege('anon','audit.sb25_default_sequence','USAGE,SELECT,UPDATE')
      OR has_sequence_privilege('authenticated','audit.sb25_default_sequence','USAGE,SELECT,UPDATE')
      OR has_function_privilege('anon','audit.sb25_default_function()','EXECUTE')
      OR (has_function_privilege('authenticated','audit.sb25_default_function()','EXECUTE')
        AND has_schema_privilege('authenticated','audit','USAGE')) THEN
      RAISE EXCEPTION 'audit defaults retain client access for %', creator.name;
    END IF;
    DROP FUNCTION audit.sb25_default_function();
    DROP SEQUENCE audit.sb25_default_sequence;
    DROP TABLE audit.sb25_default_table;
  END LOOP;
END;
$probe$;
$defaults$, 'new audit objects deny client access despite global function defaults');
SELECT ok(NOT has_schema_privilege(role_name, 'audit', 'USAGE'),
  format('%s cannot use audit', role_name))
FROM unnest(ARRAY['anon','authenticated']) role_name;
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT audit.disable_tracking(''audit.record_version''::regclass)',
  '42501', 'permission denied for schema audit', 'anon cannot disable audit tracking');
SELECT throws_ok($$SELECT public.validate_cross_app_token('sb25-invalid-token', 'web')$$,
  '42501', 'permission denied for function validate_cross_app_token', 'anon cannot call the legacy validator');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT audit.disable_tracking(''audit.record_version''::regclass)',
  '42501', 'permission denied for schema audit', 'authenticated cannot disable audit tracking');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok('SELECT audit.primary_key_columns(''audit.record_version''::regclass)',
  'service role can still query audit metadata');
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon', 'public.validate_cross_app_token(text,text)', 'EXECUTE'),
  'legacy cross-app validator is closed to anon');
SELECT ok(has_function_privilege('authenticated', 'public.validate_cross_app_token(text,text)', 'EXECUTE'),
  'legacy authenticated grant is preserved');
SELECT ok(has_function_privilege('service_role', 'public.validate_cross_app_token(text,text)', 'EXECUTE'),
  'legacy service grant is preserved');
SELECT ok(has_function_privilege(role_name, 'public.validate_cross_app_token_with_session(text,text)', 'EXECUTE'),
  format('session-bound redemption remains available to %s', role_name))
FROM unnest(ARRAY['anon','authenticated','service_role']) role_name;
SELECT * FROM finish();
ROLLBACK;
