-- Rollback: 20261026190200_password_vault_operations.sql
-- Manual reverse-order rollback. Unexpected dependencies fail without CASCADE.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DROP FUNCTION private.password_vault_list(uuid, uuid, uuid, uuid, integer);
DROP FUNCTION private.password_vault_execute(uuid, uuid, uuid, uuid, text, jsonb, uuid, text);
DROP FUNCTION private.password_vault_require_workspace_member(uuid, uuid);
COMMIT;
