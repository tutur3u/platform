-- Execute only after the Storage API confirms deletion of the empty owned bucket.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='password-vault-files') THEN
  RAISE EXCEPTION 'Delete the empty vault bucket through the Storage API before removing fences' USING ERRCODE='55000';
 END IF;
END $$;
DROP POLICY password_vault_objects_client_fence ON storage.objects;
DROP POLICY password_vault_bucket_client_fence ON storage.buckets;
COMMIT;
