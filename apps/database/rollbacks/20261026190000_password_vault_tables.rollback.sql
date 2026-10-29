-- Rollback: 20261026190000_password_vault_tables.sql
-- Manual reverse-order rollback. Unexpected dependencies fail without CASCADE.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Dropping these tables destroys ciphertext, key envelopes, request receipts and audit history.
-- Refuse populated tables; separately preserve and verify recovery data before disposal.
LOCK TABLE private.password_vaults, private.password_vault_members, private.password_vault_versions, private.password_vault_files, private.password_vault_items, private.password_vault_machine_grants, private.password_vault_machine_tokens, private.password_vault_requests, private.password_vault_audit_events IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM private.password_vaults) THEN RAISE EXCEPTION 'Rollback refused: private.password_vaults retains data; verified recovery is required'; END IF;
 IF EXISTS (SELECT 1 FROM private.password_vault_members) THEN RAISE EXCEPTION 'Rollback refused: private.password_vault_members retains data; verified recovery is required'; END IF;
 IF EXISTS (SELECT 1 FROM private.password_vault_versions) THEN RAISE EXCEPTION 'Rollback refused: private.password_vault_versions retains data; verified recovery is required'; END IF;
 IF EXISTS (SELECT 1 FROM private.password_vault_files) THEN RAISE EXCEPTION 'Rollback refused: private.password_vault_files retains data; verified recovery is required'; END IF;
 IF EXISTS (SELECT 1 FROM private.password_vault_items) THEN RAISE EXCEPTION 'Rollback refused: private.password_vault_items retains data; verified recovery is required'; END IF;
 IF EXISTS (SELECT 1 FROM private.password_vault_machine_grants) THEN RAISE EXCEPTION 'Rollback refused: private.password_vault_machine_grants retains data; verified recovery is required'; END IF;
 IF EXISTS (SELECT 1 FROM private.password_vault_machine_tokens) THEN RAISE EXCEPTION 'Rollback refused: private.password_vault_machine_tokens retains data; verified recovery is required'; END IF;
 IF EXISTS (SELECT 1 FROM private.password_vault_requests) THEN RAISE EXCEPTION 'Rollback refused: private.password_vault_requests retains data; verified recovery is required'; END IF;
 IF EXISTS (SELECT 1 FROM private.password_vault_audit_events) THEN RAISE EXCEPTION 'Rollback refused: private.password_vault_audit_events retains data; verified recovery is required'; END IF;
END $$;
DROP TRIGGER password_vault_audit_no_truncate ON private.password_vault_audit_events;
DROP TRIGGER password_vault_audit_no_mutation ON private.password_vault_audit_events;
DROP FUNCTION private.password_vault_audit_immutable();
DROP TABLE private.password_vault_audit_events;
DROP TABLE private.password_vault_requests;
DROP TABLE private.password_vault_machine_tokens;
DROP TABLE private.password_vault_machine_grants;
DROP TABLE private.password_vault_items;
DROP TABLE private.password_vault_files;
ALTER TABLE private.password_vaults DROP CONSTRAINT password_vault_active_version_fk;
DROP TABLE private.password_vault_versions;
DROP TABLE private.password_vault_members;
DROP TABLE private.password_vaults;
-- private schema and service_role USAGE predate this migration on main; preserve both.
COMMIT;
