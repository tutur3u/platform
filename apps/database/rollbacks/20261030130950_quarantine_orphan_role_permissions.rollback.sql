BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Restoring cross-workspace rows fails with 23503 (and aborts this transaction)
-- while the composite foreign key from 20261030131000 stands; drop
-- workspace_role_permissions_ws_role_fkey first on purpose.

-- Restore each quarantined row to the live table and drop it from quarantine.
-- A row whose key was recreated live in the meantime stays quarantined.
WITH restored AS (
  INSERT INTO public.workspace_role_permissions
    (ws_id, permission, enabled, created_at, role_id)
  SELECT q.ws_id, q.permission, q.enabled, q.created_at, q.role_id
  FROM private.workspace_role_permissions_orphans_20261031 q
  ON CONFLICT DO NOTHING
  RETURNING ws_id, permission, role_id
)
DELETE FROM private.workspace_role_permissions_orphans_20261031 q
USING restored r
WHERE q.ws_id = r.ws_id
  AND q.permission = r.permission
  AND q.role_id = r.role_id;
COMMIT;
-- The empty quarantine table is retained as audit evidence; drop it manually
-- once the rollback is confirmed.
