-- Rollback for 20261028092700_grant_mastermind_owner.sql.
--
-- Removes the owner grant through the audited revoke RPC (fail closed), then
-- drops the email helper. The Mastermind role, its permission row and the
-- audit trail stay; 20261028092600's rollback removes those.

BEGIN;

DO $$
DECLARE
  v_user uuid;
BEGIN
  FOR v_user IN
    SELECT u.id FROM auth.users u
    WHERE lower(u.email) = 'phucvo@tuturuuu.com'
  LOOP
    PERFORM private.revoke_mastermind_access(
      v_user,
      'Rollback of migration 20261028092700'
    );
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS private.grant_mastermind_access_by_email(text, text);

COMMIT;
