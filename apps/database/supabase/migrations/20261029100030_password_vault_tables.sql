-- No plaintext fields, secret fingerprints, token prefixes, or token suffixes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE SCHEMA IF NOT EXISTS private;
-- Live IDs are validated by RPCs; lifecycle jobs clear them without cross-domain FK writes.
CREATE TABLE private.password_vaults (
  id uuid PRIMARY KEY,
  ws_id uuid,
  -- Stable encryption/FK context survives detachment from a hard-deleted workspace.
  scope_ws_id uuid NOT NULL,
  retired_at timestamptz,
  label text NOT NULL CHECK (label = btrim(label) AND char_length(label) BETWEEN 1 AND 128 AND label !~ '[[:cntrl:]]'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  authorization_epoch bigint NOT NULL DEFAULT 1 CHECK (authorization_epoch > 0),
  active_version integer NOT NULL DEFAULT 1 CHECK (active_version > 0),
  rotation_required boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope_ws_id, id),
  UNIQUE (ws_id, id),
  CHECK (ws_id IS NULL OR ws_id = scope_ws_id)
);
CREATE UNIQUE INDEX password_vault_label_idx ON private.password_vaults(ws_id, lower(label));
CREATE TABLE private.password_vault_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL,
  vault_id uuid NOT NULL,
  user_id uuid,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ws_id, vault_id, user_id),
  FOREIGN KEY (ws_id, vault_id) REFERENCES private.password_vaults(scope_ws_id, id) ON DELETE RESTRICT
);
CREATE INDEX password_vault_members_user_idx ON private.password_vault_members(ws_id, user_id, vault_id)
  WHERE revoked_at IS NULL;
CREATE TABLE private.password_vault_versions (
  ws_id uuid NOT NULL,
  vault_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  encrypted_data_key text NOT NULL CHECK (octet_length(encrypted_data_key) BETWEEN 32 AND 4096),
  algorithm text NOT NULL DEFAULT 'AES256GCM' CHECK (algorithm = 'AES256GCM'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ws_id, vault_id, version),
  FOREIGN KEY (ws_id, vault_id) REFERENCES private.password_vaults(scope_ws_id, id) ON DELETE RESTRICT
);
ALTER TABLE private.password_vaults ADD CONSTRAINT password_vault_active_version_fk
  FOREIGN KEY (scope_ws_id, id, active_version)
  REFERENCES private.password_vault_versions(ws_id, vault_id, version) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE private.password_vault_files (
  id uuid PRIMARY KEY,
  ws_id uuid NOT NULL,
  vault_id uuid NOT NULL,
  version integer NOT NULL,
  item_id uuid NOT NULL,
  storage_object_id uuid NOT NULL UNIQUE REFERENCES storage.objects(id) ON DELETE RESTRICT,
  ciphertext_bytes bigint NOT NULL CHECK (ciphertext_bytes BETWEEN 1 AND 10485760),
  object_path text GENERATED ALWAYS AS
    (ws_id::text || '/' || vault_id::text || '/' || version::text || '/' || item_id::text || '/' || id::text) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ws_id, vault_id, version, item_id, id),
  FOREIGN KEY (ws_id, vault_id, version)
    REFERENCES private.password_vault_versions(ws_id, vault_id, version) ON DELETE RESTRICT
);
CREATE TABLE private.password_vault_items (
  ws_id uuid NOT NULL,
  vault_id uuid NOT NULL,
  id uuid NOT NULL,
  version integer NOT NULL,
  name text NOT NULL CHECK (name = btrim(name) AND char_length(name) BETWEEN 1 AND 128 AND name !~ '[[:cntrl:]]'),
  revision bigint NOT NULL CHECK (revision > 0),
  encrypted_payload text CHECK (octet_length(encrypted_payload) BETWEEN 32 AND 1048576),
  encrypted_file_id uuid,
  encrypted_metadata text CHECK (octet_length(encrypted_metadata) BETWEEN 32 AND 65536),
  ciphertext_bytes bigint NOT NULL CHECK (ciphertext_bytes BETWEEN 1 AND 10485760),
  deleted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ws_id, vault_id, id),
  FOREIGN KEY (ws_id, vault_id, version)
    REFERENCES private.password_vault_versions(ws_id, vault_id, version) ON DELETE RESTRICT,
  FOREIGN KEY (ws_id, vault_id, version, id, encrypted_file_id)
    REFERENCES private.password_vault_files(ws_id, vault_id, version, item_id, id) ON DELETE RESTRICT,
  CHECK ((encrypted_payload IS NOT NULL AND encrypted_file_id IS NULL AND encrypted_metadata IS NULL)
    OR (encrypted_payload IS NULL AND encrypted_file_id IS NOT NULL AND encrypted_metadata IS NOT NULL))
);
CREATE UNIQUE INDEX password_vault_item_name_idx ON private.password_vault_items(ws_id, vault_id, lower(name))
  WHERE deleted_at IS NULL;
CREATE INDEX password_vault_items_page_idx ON private.password_vault_items(ws_id, vault_id, id)
  WHERE deleted_at IS NULL;
CREATE TABLE private.password_vault_machine_grants (
  ws_id uuid NOT NULL,
  vault_id uuid NOT NULL,
  id uuid NOT NULL,
  issuer_user_id uuid,
  authorization_epoch bigint NOT NULL,
  scopes text[] NOT NULL CHECK (cardinality(scopes) BETWEEN 1 AND 2
    AND scopes <@ ARRAY['item.read', 'item.write']::text[] AND array_position(scopes, NULL) IS NULL),
  item_ids uuid[] NOT NULL CHECK (cardinality(item_ids) BETWEEN 1 AND 100
    AND array_position(item_ids, NULL) IS NULL),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (ws_id, vault_id, id),
  FOREIGN KEY (ws_id, vault_id) REFERENCES private.password_vaults(scope_ws_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours')
);
CREATE TABLE private.password_vault_machine_tokens (
  ws_id uuid NOT NULL,
  vault_id uuid NOT NULL,
  id uuid NOT NULL,
  grant_id uuid NOT NULL,
  -- SHA-256 of the decoded random 256-bit bearer credential, not a secret-content hash.
  token_digest text NOT NULL CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (ws_id, vault_id, id),
  UNIQUE (token_digest),
  FOREIGN KEY (ws_id, vault_id, grant_id)
    REFERENCES private.password_vault_machine_grants(ws_id, vault_id, id) ON DELETE RESTRICT,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes')
);
CREATE INDEX password_vault_machine_tokens_grant_idx
  ON private.password_vault_machine_tokens(ws_id, vault_id, grant_id);
CREATE TABLE private.password_vault_requests (
  ws_id uuid NOT NULL,
  vault_id uuid NOT NULL,
  request_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  token_id uuid,
  action text NOT NULL,
  -- Exact ciphertext/input comparison prevents request-id reuse with different intent.
  -- No plaintext may enter this object. It has the same privilege boundary as items.
  input jsonb NOT NULL CHECK (octet_length(input::text) <= 12582912),
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ws_id, vault_id, request_id),
  FOREIGN KEY (ws_id, vault_id) REFERENCES private.password_vaults(scope_ws_id, id) ON DELETE RESTRICT
);
CREATE TABLE private.password_vault_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ws_id uuid NOT NULL,
  vault_id uuid,
  request_id uuid NOT NULL,
  actor_user_id uuid NOT NULL,
  token_id uuid,
  actor_type text NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'machine', 'system')),
  event_type text NOT NULL CHECK (event_type IN ('vault.create', 'item.read', 'item.list',
    'item.write', 'item.delete', 'member.set', 'rotation.snapshot', 'vault.rotate',
    'grant.create', 'grant.revoke', 'token.issue', 'member.workspace_revoke', 'vault.rename', 'vault.list', 'key.read',
    'member.list', 'audit.list', 'request.status', 'member.account_erased', 'vault.workspace_erased')),
  item_id uuid,
  -- Fixed counters and opaque pagination cursor only; never labels or client metadata.
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object'
    AND metadata - ARRAY['revision', 'authorizationEpoch', 'itemCount', 'pageLimit', 'afterId']::text[] = '{}'::jsonb
    AND jsonb_typeof(metadata->'revision') IS NOT DISTINCT FROM 'number'
    AND jsonb_typeof(metadata->'authorizationEpoch') IS NOT DISTINCT FROM 'number'
    AND (NOT metadata ? 'itemCount' OR jsonb_typeof(metadata->'itemCount') = 'number')
    AND (NOT metadata ? 'pageLimit' OR jsonb_typeof(metadata->'pageLimit') = 'number')
    AND (NOT metadata ? 'afterId' OR metadata->'afterId' = 'null'::jsonb
      OR metadata->>'afterId' ~ '^[0-9a-f-]{36}$')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (ws_id, vault_id, request_id),
  CHECK ((event_type = 'vault.list') = (vault_id IS NULL))
  -- Deliberately no parent/user FK: deleting an identity cannot rewrite audit history.
);
CREATE INDEX password_vault_audit_page_idx
  ON private.password_vault_audit_events(ws_id, vault_id, created_at DESC, id DESC);
CREATE FUNCTION private.password_vault_audit_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Password vault audit events are append-only' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER password_vault_audit_no_mutation BEFORE UPDATE OR DELETE
  ON private.password_vault_audit_events FOR EACH ROW EXECUTE FUNCTION private.password_vault_audit_immutable();
CREATE TRIGGER password_vault_audit_no_truncate BEFORE TRUNCATE
  ON private.password_vault_audit_events FOR EACH STATEMENT EXECUTE FUNCTION private.password_vault_audit_immutable();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['password_vaults', 'password_vault_members', 'password_vault_versions',
    'password_vault_items', 'password_vault_files', 'password_vault_machine_grants', 'password_vault_machine_tokens',
    'password_vault_requests', 'password_vault_audit_events'] LOOP
    EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE private.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role', t);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION private.password_vault_audit_immutable()
  FROM PUBLIC, anon, authenticated, supabase_auth_admin, service_role;
GRANT USAGE ON SCHEMA private TO service_role;
-- No direct table privileges, even for service_role: use the atomic audited RPC.
-- Existing private-schema auth-hook grants are preserved; these objects grant none.
COMMIT;
