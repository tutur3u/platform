-- Rollback: 20261026190300_password_vault_lifecycle.sql
-- Manual reverse-order rollback. Unexpected dependencies fail without CASCADE.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Lifecycle processing can erase identities and revoke credentials; SQL cannot reverse that history.
-- Refuse discarding any jobs or removing lifecycle protection from live vaults.
LOCK TABLE private.password_vaults, private.password_vault_lifecycle_jobs IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM private.password_vault_lifecycle_jobs) OR EXISTS (SELECT 1 FROM private.password_vaults) THEN
 RAISE EXCEPTION 'Rollback refused: vault lifecycle state exists; erased identities and revocations require verified recovery';
 END IF;
END $$;
DROP FUNCTION private.password_vault_retry_lifecycle(integer);
DROP FUNCTION private.password_vault_reconcile_lifecycle();
DROP FUNCTION private.password_vault_apply_lifecycle(uuid);
DROP FUNCTION private.password_vault_require_lifecycle_clean(uuid);
DROP TRIGGER password_vault_workspace_erased ON public.workspaces;
DROP TRIGGER password_vault_account_erased ON auth.users;
DROP TRIGGER password_vault_workspace_user_unlinked ON public.workspace_user_linked_users;
DROP TRIGGER password_vault_workspace_user_archived ON public.workspace_users;
DROP TRIGGER password_vault_workspace_member_changed ON public.workspace_members;
DROP FUNCTION private.password_vault_workspace_erased();
DROP FUNCTION private.password_vault_account_erased();
DROP FUNCTION private.password_vault_workspace_user_unlinked();
DROP FUNCTION private.password_vault_workspace_user_archived();
DROP FUNCTION private.password_vault_workspace_member_changed();
DROP FUNCTION private.password_vault_invalidate_workspace_member(uuid, uuid);
DROP FUNCTION private.password_vault_enqueue_lifecycle(text, uuid, uuid);
DROP TABLE private.password_vault_lifecycle_jobs;
-- Earlier function owners and service-only grants are unchanged; retain them.
COMMIT;
