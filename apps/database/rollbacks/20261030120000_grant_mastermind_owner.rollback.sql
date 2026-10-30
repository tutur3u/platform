BEGIN;
DO $$
DECLARE v_owner uuid;
BEGIN
  FOR v_owner IN
    SELECT DISTINCT target_user_id FROM private.mastermind_access_audit
    WHERE action = 'grant' AND changed
      AND reason = 'Root workspace creator grant, migration 20261030120000'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM private.mastermind_access_audit later
      WHERE later.target_user_id = v_owner AND later.action = 'grant'
        AND later.reason <> 'Root workspace creator grant, migration 20261030120000'
        AND later.id > (SELECT max(id) FROM private.mastermind_access_audit
          WHERE target_user_id = v_owner
          AND reason = 'Root workspace creator grant, migration 20261030120000')
    ) THEN
      PERFORM private.revoke_mastermind_access(v_owner, 'Rollback owner migration 20261030120000');
    END IF;
  END LOOP;
END $$;
DROP FUNCTION private.grant_mastermind_root_creator();
COMMIT;
