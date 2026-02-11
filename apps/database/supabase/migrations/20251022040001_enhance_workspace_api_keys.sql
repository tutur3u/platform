-- Enhance workspace_api_keys table for SDK authentication
-- This migration updates the existing workspace_api_keys table to support
-- secure API key management with role-based permissions
--
-- NOTE: This migration depends on 20251021000000_add_api_key_permissions.sql
-- which adds the required enum values

-- Step 1: Add new key_hash column (additive migration)
-- This is a non-destructive additive migration that allows gradual migration
-- Old 'value' column will be maintained until all keys are migrated
--
-- Deployment sequence:
-- 1. Apply this migration (adds key_hash column)
-- 2. Deploy application that writes to both value (plaintext, deprecated) and key_hash (scrypt hash)
-- 3. Backfill existing rows with proper hashing:
--    CRITICAL: Do NOT simply copy plaintext values to key_hash!
--    Instead, run a one-off application job that:
--    a. Reads each plaintext 'value' from the database
--    b. Hashes it using the same scrypt parameters the application uses:
--       - N=16384 (CPU/memory cost factor)
--       - r=8 (block size)
--       - p=1 (parallelization factor)
--       - keylen=64 (output key length)
--       - salt=16-byte random salt (generated per-key or from workspace ID)
--    c. Writes the resulting hash to 'key_hash' column
--    d. Implements error handling: if hashing fails, log the error and skip that row
--    e. After backfill completes, verify all rows have non-null key_hash before proceeding
--    Example (pseudocode):
--      FOR EACH row IN workspace_api_keys WHERE key_hash IS NULL:
--        TRY:
--          hashed = scrypt(row.value, salt, {N:16384, r:8, p:1, keylen:64})
--          UPDATE workspace_api_keys SET key_hash = hashed WHERE id = row.id
--        CATCH error:
--          LOG("Failed to hash key_id=" + row.id + ": " + error)
--          CONTINUE
-- 4. Deploy application that reads from key_hash (falling back to value if needed for safety)
-- 5. Verify all traffic uses key_hash via metrics/logs (no fallback to value in production)
-- 6. In a future reversible migration, drop the value column ONLY after verification that:
--    - All keys are hashed (SELECT COUNT(*) FROM workspace_api_keys WHERE key_hash IS NULL should be 0)
--    - All API authentication traffic uses key_hash (confirmed via logs/metrics)
--
-- Rollback notes:
-- To rollback, simply continue using the 'value' column in the application
-- The key_hash column can be dropped in a separate migration if needed: ALTER TABLE workspace_api_keys DROP COLUMN key_hash;

-- Add key_hash column alongside existing value column
ALTER TABLE "public"."workspace_api_keys"
  ADD COLUMN IF NOT EXISTS "key_hash" TEXT;

-- Add new columns to workspace_api_keys
ALTER TABLE "public"."workspace_api_keys"
  ADD COLUMN IF NOT EXISTS "key_prefix" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "role_id" UUID REFERENCES "public"."workspace_roles"(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "created_by" UUID REFERENCES "auth"."users"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_expires_at ON "public"."workspace_api_keys"(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_role_id ON "public"."workspace_api_keys"(role_id);

-- Add partial unique index to enforce uniqueness of key_prefix within a workspace
-- and speed up lookups by key_prefix
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_api_keys_ws_id_key_prefix
  ON "public"."workspace_api_keys"(ws_id, key_prefix)
  WHERE key_prefix IS NOT NULL;

-- Add partial unique index to enforce uniqueness of key_hash within a workspace
-- Prevents duplicate key hashes which could indicate a security issue
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_api_keys_ws_id_key_hash
  ON "public"."workspace_api_keys"(ws_id, key_hash)
  WHERE key_hash IS NOT NULL;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_workspace_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_workspace_api_keys_updated_at ON "public"."workspace_api_keys";
CREATE TRIGGER update_workspace_api_keys_updated_at
  BEFORE UPDATE ON "public"."workspace_api_keys"
  FOR EACH ROW
  EXECUTE FUNCTION update_workspace_api_keys_updated_at();

-- Drop old RLS policies
DROP POLICY IF EXISTS "Enable all access for workspace admins" ON "public"."workspace_api_keys";

-- Create new RLS policies using role-based permissions

-- Allow workspace members with manage_api_keys permission to view API keys
CREATE POLICY "Allow authorized members to view API keys"
  ON "public"."workspace_api_keys"
  FOR SELECT
  TO authenticated
  USING (
    is_org_member(auth.uid(), ws_id) AND
    (
      -- Check if user has manage_api_keys permission via role membership
      EXISTS (
        SELECT 1
        FROM workspace_role_members wrm
        JOIN workspace_roles wr
          ON wr.id = wrm.role_id
        JOIN workspace_role_permissions wrp
          ON wrp.role_id = wrm.role_id
          AND wrp.ws_id = workspace_api_keys.ws_id
        WHERE wrm.user_id = auth.uid()
          AND wr.ws_id = workspace_api_keys.ws_id
          AND wrp.permission = 'manage_api_keys'
          AND wrp.enabled = true
      )
      OR
      -- Also check workspace-wide default permissions
      EXISTS (
        SELECT 1
        FROM workspace_default_permissions wdp
        WHERE wdp.ws_id = workspace_api_keys.ws_id
          AND wdp.permission = 'manage_api_keys'
          AND wdp.enabled = true
          AND EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.ws_id = workspace_api_keys.ws_id
            AND wm.user_id = auth.uid()
          )
      )
    )
  );

-- Allow workspace members with manage_api_keys permission to create API keys
CREATE POLICY "Allow authorized members to create API keys"
  ON "public"."workspace_api_keys"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_org_member(auth.uid(), ws_id) AND
    (
      -- Check if user has manage_api_keys permission via role membership
      EXISTS (
        SELECT 1
        FROM workspace_role_members wrm
        JOIN workspace_roles wr
          ON wr.id = wrm.role_id
        JOIN workspace_role_permissions wrp
          ON wrp.role_id = wrm.role_id
          AND wrp.ws_id = workspace_api_keys.ws_id
        WHERE wrm.user_id = auth.uid()
          AND wr.ws_id = workspace_api_keys.ws_id
          AND wrp.permission = 'manage_api_keys'
          AND wrp.enabled = true
      )
      OR
      -- Also check workspace-wide default permissions
      EXISTS (
        SELECT 1
        FROM workspace_default_permissions wdp
        WHERE wdp.ws_id = workspace_api_keys.ws_id
          AND wdp.permission = 'manage_api_keys'
          AND wdp.enabled = true
          AND EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.ws_id = workspace_api_keys.ws_id
            AND wm.user_id = auth.uid()
          )
      )
    )
  );

-- Allow workspace members with manage_api_keys permission to update API keys
CREATE POLICY "Allow authorized members to update API keys"
  ON "public"."workspace_api_keys"
  FOR UPDATE
  TO authenticated
  USING (
    is_org_member(auth.uid(), ws_id) AND
    (
      -- Check if user has manage_api_keys permission via role membership
      EXISTS (
        SELECT 1
        FROM workspace_role_members wrm
        JOIN workspace_roles wr
          ON wr.id = wrm.role_id
        JOIN workspace_role_permissions wrp
          ON wrp.role_id = wrm.role_id
          AND wrp.ws_id = workspace_api_keys.ws_id
        WHERE wrm.user_id = auth.uid()
          AND wr.ws_id = workspace_api_keys.ws_id
          AND wrp.permission = 'manage_api_keys'
          AND wrp.enabled = true
      )
      OR
      -- Also check workspace-wide default permissions
      EXISTS (
        SELECT 1
        FROM workspace_default_permissions wdp
        WHERE wdp.ws_id = workspace_api_keys.ws_id
          AND wdp.permission = 'manage_api_keys'
          AND wdp.enabled = true
          AND EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.ws_id = workspace_api_keys.ws_id
            AND wm.user_id = auth.uid()
          )
      )
    )
  )
  WITH CHECK (
    is_org_member(auth.uid(), ws_id) AND
    (
      -- Check if user has manage_api_keys permission via role membership
      EXISTS (
        SELECT 1
        FROM workspace_role_members wrm
        JOIN workspace_roles wr
          ON wr.id = wrm.role_id
        JOIN workspace_role_permissions wrp
          ON wrp.role_id = wrm.role_id
          AND wrp.ws_id = workspace_api_keys.ws_id
        WHERE wrm.user_id = auth.uid()
          AND wr.ws_id = workspace_api_keys.ws_id
          AND wrp.permission = 'manage_api_keys'
          AND wrp.enabled = true
      )
      OR
      -- Also check workspace-wide default permissions
      EXISTS (
        SELECT 1
        FROM workspace_default_permissions wdp
        WHERE wdp.ws_id = workspace_api_keys.ws_id
          AND wdp.permission = 'manage_api_keys'
          AND wdp.enabled = true
          AND EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.ws_id = workspace_api_keys.ws_id
            AND wm.user_id = auth.uid()
          )
      )
    )
  );

-- Allow workspace members with manage_api_keys permission to delete API keys
CREATE POLICY "Allow authorized members to delete API keys"
  ON "public"."workspace_api_keys"
  FOR DELETE
  TO authenticated
  USING (
    is_org_member(auth.uid(), ws_id) AND
    (
      -- Check if user has manage_api_keys permission via role membership
      EXISTS (
        SELECT 1
        FROM workspace_role_members wrm
        JOIN workspace_roles wr
          ON wr.id = wrm.role_id
        JOIN workspace_role_permissions wrp
          ON wrp.role_id = wrm.role_id
          AND wrp.ws_id = workspace_api_keys.ws_id
        WHERE wrm.user_id = auth.uid()
          AND wr.ws_id = workspace_api_keys.ws_id
          AND wrp.permission = 'manage_api_keys'
          AND wrp.enabled = true
      )
      OR
      -- Also check workspace-wide default permissions
      EXISTS (
        SELECT 1
        FROM workspace_default_permissions wdp
        WHERE wdp.ws_id = workspace_api_keys.ws_id
          AND wdp.permission = 'manage_api_keys'
          AND wdp.enabled = true
          AND EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.ws_id = workspace_api_keys.ws_id
            AND wm.user_id = auth.uid()
          )
      )
    )
  );

-- Add comments for documentation
COMMENT ON TABLE "public"."workspace_api_keys" IS 'API keys for external SDK authentication with role-based permissions';
COMMENT ON COLUMN "public"."workspace_api_keys"."key_hash" IS 'Scrypt hash of the API key for secure storage';
COMMENT ON COLUMN "public"."workspace_api_keys"."key_prefix" IS 'First 12 characters of key (ttr_xxxx) for identification without exposing full key';
COMMENT ON COLUMN "public"."workspace_api_keys"."role_id" IS 'Workspace role that determines permissions for this API key';
COMMENT ON COLUMN "public"."workspace_api_keys"."last_used_at" IS 'Timestamp of when this key was last used for API requests';
COMMENT ON COLUMN "public"."workspace_api_keys"."expires_at" IS 'Optional expiration date for the API key';
