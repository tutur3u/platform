-- Apply after 001, before the operation entrypoints and lifecycle hooks.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('password-vault-files', 'password-vault-files', false, 10485760, ARRAY['application/octet-stream'])
  ON CONFLICT (id) DO NOTHING;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated','supabase_auth_admin')
    AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Passwords client role unexpectedly bypasses RLS';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='storage' AND c.relname IN ('objects','buckets') AND NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'Passwords requires existing Storage RLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'password-vault-files'
    AND name = 'password-vault-files' AND public IS FALSE AND file_size_limit = 10485760
    AND allowed_mime_types = ARRAY['application/octet-stream']::text[]) THEN
    RAISE EXCEPTION 'Passwords bucket configuration conflict';
  END IF;
END $$;
-- Restrictive policies fence this bucket even if an older permissive policy is broad.
CREATE POLICY password_vault_objects_client_fence ON storage.objects AS RESTRICTIVE
  FOR ALL TO anon, authenticated, supabase_auth_admin
  USING (bucket_id <> 'password-vault-files') WITH CHECK (bucket_id <> 'password-vault-files');
CREATE POLICY password_vault_bucket_client_fence ON storage.buckets AS RESTRICTIVE
  FOR ALL TO anon, authenticated, supabase_auth_admin
  USING (id <> 'password-vault-files') WITH CHECK (id <> 'password-vault-files');
CREATE FUNCTION private.password_vault_register_file(p_ws uuid, p_vault uuid, p_version integer,
  p_item uuid, p_file uuid, p_object uuid, p_bytes bigint)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
DECLARE expected_path text;
BEGIN
  expected_path := p_ws::text || '/' || p_vault::text || '/' || p_version::text || '/' || p_item::text || '/' || p_file::text;
  IF p_file IS NULL OR p_object IS NULL OR p_bytes IS NULL THEN
    RAISE EXCEPTION 'Invalid file reference' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM storage.objects WHERE id = p_object AND bucket_id = 'password-vault-files'
    AND name = expected_path AND (metadata->>'size')::bigint = p_bytes
    AND metadata->>'mimetype' = 'application/octet-stream' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid file reference' USING ERRCODE = '22023'; END IF;
  INSERT INTO private.password_vault_files(id, ws_id, vault_id, version, item_id, storage_object_id, ciphertext_bytes)
    VALUES (p_file, p_ws, p_vault, p_version, p_item, p_object, p_bytes) ON CONFLICT (id) DO NOTHING;
  IF NOT EXISTS (SELECT 1 FROM private.password_vault_files WHERE id = p_file AND ws_id = p_ws
    AND vault_id = p_vault AND version = p_version AND item_id = p_item AND storage_object_id = p_object
    AND ciphertext_bytes = p_bytes) THEN
    RAISE EXCEPTION 'File identity conflict' USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE ALL ON FUNCTION private.password_vault_register_file(uuid, uuid, integer, uuid, uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role;
COMMIT;
