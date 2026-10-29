BEGIN;

REVOKE EXECUTE ON FUNCTION public.generate_cross_app_token(uuid, text, text, integer, jsonb)
FROM service_role;

-- NOTE: this schema-scoped default-privilege revoke is not what closes new
-- private functions. Schema-scoped entries can only add privileges, so it cannot
-- subtract a global default. PUBLIC and anon are already closed by the global
-- default privilege of 20261027151200; only authenticated and service_role keep
-- default EXECUTE on a function created in schema private afterwards. The SQL
-- grant guard's explicit same-file REVOKE rule for every new SECURITY DEFINER
-- function is the enforcement for those two roles, not this statement.
-- See "SQL grant guard" in apps/docs/reference/database/migrations-guide.mdx.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- tuturuuu: reviewed(dynamic-sql-review): SR-331 revoke-only default-privilege fence; the format() input is the owner role name from pg_catalog, with no GRANT
DO $private_defaults$
DECLARE creator record;
BEGIN
  FOR creator IN
    SELECT DISTINCT owner_oid
    FROM (
      SELECT nspowner AS owner_oid FROM pg_namespace WHERE nspname = 'private'
      UNION SELECT p.proowner FROM pg_proc p WHERE p.pronamespace = to_regnamespace('private')
      UNION SELECT c.relowner FROM pg_class c WHERE c.relnamespace = to_regnamespace('private')
      UNION SELECT d.defaclrole FROM pg_default_acl d WHERE d.defaclnamespace = to_regnamespace('private')
    ) owners
    WHERE owner_oid <> 'postgres'::regrole::oid
  LOOP
    IF NOT pg_has_role(current_user, creator.owner_oid, 'MEMBER') THEN
      RAISE NOTICE 'Skipping private function defaults for non-member role %', pg_get_userbyid(creator.owner_oid);
      CONTINUE;
    END IF;
    -- Same limitation as above: this does not remove the global PUBLIC default.
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
      pg_get_userbyid(creator.owner_oid)
    );
  END LOOP;
END;
$private_defaults$;

COMMIT;
