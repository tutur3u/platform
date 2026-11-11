-- Manual rollback only. Roll back 20261111120100 (workspace domains, whose
-- policies read these permissions) first. Postgres cannot drop an enum value,
-- so 'view_workspace_domains' and 'manage_workspace_domains' stay in
-- workspace_role_permission; with the domain tables gone they grant nothing.
-- Role grants of them are kept so a re-apply restores access.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

SELECT 1;

COMMIT;
