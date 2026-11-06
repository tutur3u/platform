BEGIN;
-- Use audit provenance, not the possibly changed workspace creator.
-- Preserve any later intentional grant, including an idempotent operator grant.
SELECT private.revoke_mastermind_access(
  owner_grant.target_user_id, 'Rollback owner migration 20261030120000'
)
FROM (
  SELECT target_user_id, max(id) AS grant_id
  FROM private.mastermind_access_audit
  WHERE action = 'grant' AND changed
    AND reason = 'Root workspace creator grant, migration 20261030120000'
  GROUP BY target_user_id
) owner_grant
WHERE NOT EXISTS (
  SELECT 1 FROM private.mastermind_access_audit later
  WHERE later.target_user_id = owner_grant.target_user_id
    AND later.action = 'grant' AND later.id > owner_grant.grant_id
    AND later.reason <> 'Root workspace creator grant, migration 20261030120000'
);
DROP FUNCTION IF EXISTS private.grant_mastermind_root_creator();
COMMIT;
