-- Rollback: 20261026190100_password_vault_storage.sql
-- Manual reverse-order rollback. Unexpected dependencies fail without CASCADE.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- Storage bytes cannot be recovered by SQL. Refuse deletion while objects remain.
LOCK TABLE storage.buckets, storage.objects IN ACCESS EXCLUSIVE MODE;
-- INSERT ... ON CONFLICT did not record whether the bucket already existed.
-- Require an operator-confirmed pre-migration absence; never delete an adopted bucket.
DO $$ BEGIN
 IF current_setting('tuturuuu.rollback.password_vault_bucket_created',true) IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Rollback refused: confirm from pre-migration evidence that password-vault-files was newly created, then SET tuturuuu.rollback.password_vault_bucket_created = true';
 END IF;
 IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='password-vault-files') THEN
 RAISE EXCEPTION 'Rollback refused: password-vault-files contains objects; verified ciphertext recovery is required';
 END IF;
END $$;
DROP FUNCTION private.password_vault_register_file(uuid, uuid, integer, uuid, uuid, uuid, bigint);
DROP POLICY password_vault_bucket_client_fence ON storage.buckets;
DROP POLICY password_vault_objects_client_fence ON storage.objects;
-- Supabase Storage protects SQL deletion; permit only this guarded empty-bucket deletion.
SET LOCAL storage.allow_delete_query = 'true';
DELETE FROM storage.buckets WHERE id='password-vault-files';
COMMIT;
