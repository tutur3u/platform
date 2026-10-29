-- Approved pre-activation, empty-feature rollback only. Never drop shared private.
-- Reverses the 20261029100030/100040/100050/100060 Passwords sequence below.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM private.password_vaults)
    OR EXISTS(SELECT 1 FROM private.password_vault_audit_events)
    OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='password-vault-files') THEN
    RAISE EXCEPTION 'Vault rollback refuses retained data; stop traffic and fix forward' USING ERRCODE='55000';
  END IF;
END $$;
DROP TRIGGER password_vault_account_erased ON auth.users;
DROP TRIGGER password_vault_workspace_erased ON public.workspaces;
DROP TRIGGER password_vault_workspace_member_changed ON public.workspace_members;
DROP TRIGGER password_vault_workspace_user_archived ON public.workspace_users;
DROP TRIGGER password_vault_workspace_user_unlinked ON public.workspace_user_linked_users;
-- Keep the private bucket and both fences until the approved Storage API cleanup.
DROP TABLE private.password_vault_lifecycle_jobs,private.password_vault_requests,
  private.password_vault_audit_events,private.password_vault_items,private.password_vault_files,
  private.password_vault_machine_tokens,private.password_vault_machine_grants,
  private.password_vault_members,private.password_vault_versions,private.password_vaults CASCADE;
DO $$ DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='private' AND p.proname LIKE 'password_vault_%' LOOP
    EXECUTE format('DROP FUNCTION %s',f.signature);
  END LOOP;
END $$;
COMMIT;
