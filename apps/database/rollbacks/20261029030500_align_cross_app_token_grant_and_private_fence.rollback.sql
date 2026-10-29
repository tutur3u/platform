BEGIN;

GRANT EXECUTE ON FUNCTION public.generate_cross_app_token(uuid, text, text, integer, jsonb)
TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA private
GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

DO $private_defaults_rollback$
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
      RAISE NOTICE 'Skipping private function default restoration for non-member role %', pg_get_userbyid(creator.owner_oid);
      CONTINUE;
    END IF;
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA private GRANT EXECUTE ON FUNCTIONS TO PUBLIC',
      pg_get_userbyid(creator.owner_oid)
    );
  END LOOP;
END;
$private_defaults_rollback$;

COMMIT;
