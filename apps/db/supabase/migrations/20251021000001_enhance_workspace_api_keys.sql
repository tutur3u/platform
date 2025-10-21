-- Enhance workspace_api_keys table for SDK authentication
-- This migration updates the existing workspace_api_keys table to support
-- secure API key management with role-based permissions
--
-- NOTE: This migration depends on 20251021000000_add_api_key_permissions.sql
-- which adds the required enum values

-- Rename 'value' column to 'key_hash' to better reflect its purpose
-- Note: This will break existing API keys, so coordinate with users
ALTER TABLE "public"."workspace_api_keys"
  RENAME COLUMN "value" TO "key_hash";

-- Add new columns to workspace_api_keys
ALTER TABLE "public"."workspace_api_keys"
  ADD COLUMN IF NOT EXISTS "key_prefix" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "role_id" UUID REFERENCES "public"."workspace_roles"(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "created_by" UUID REFERENCES "auth"."users"(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add index on key_hash for fast lookups
CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_key_hash ON "public"."workspace_api_keys"(key_hash);
CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_expires_at ON "public"."workspace_api_keys"(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_role_id ON "public"."workspace_api_keys"(role_id);

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
    EXISTS (
      -- Check if user has manage_api_keys permission via role membership
      SELECT wrp.ws_id
      FROM workspace_role_members wrm
      JOIN workspace_role_permissions wrp
        ON wrp.role_id = wrm.role_id
        AND wrp.ws_id = workspace_api_keys.ws_id
      WHERE wrm.user_id = auth.uid()
        AND wrp.permission = 'manage_api_keys'
        AND wrp.enabled = true

      UNION

      -- Also check workspace-wide default permissions
      SELECT wdp.ws_id
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
  );

-- Allow workspace members with manage_api_keys permission to create API keys
CREATE POLICY "Allow authorized members to create API keys"
  ON "public"."workspace_api_keys"
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_org_member(auth.uid(), ws_id) AND
    EXISTS (
      -- Check if user has manage_api_keys permission via role membership
      SELECT wrp.ws_id
      FROM workspace_role_members wrm
      JOIN workspace_role_permissions wrp
        ON wrp.role_id = wrm.role_id
        AND wrp.ws_id = workspace_api_keys.ws_id
      WHERE wrm.user_id = auth.uid()
        AND wrp.permission = 'manage_api_keys'
        AND wrp.enabled = true

      UNION

      -- Also check workspace-wide default permissions
      SELECT wdp.ws_id
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
  );

-- Allow workspace members with manage_api_keys permission to update API keys
CREATE POLICY "Allow authorized members to update API keys"
  ON "public"."workspace_api_keys"
  FOR UPDATE
  TO authenticated
  USING (
    is_org_member(auth.uid(), ws_id) AND
    EXISTS (
      -- Check if user has manage_api_keys permission via role membership
      SELECT wrp.ws_id
      FROM workspace_role_members wrm
      JOIN workspace_role_permissions wrp
        ON wrp.role_id = wrm.role_id
        AND wrp.ws_id = workspace_api_keys.ws_id
      WHERE wrm.user_id = auth.uid()
        AND wrp.permission = 'manage_api_keys'
        AND wrp.enabled = true

      UNION

      -- Also check workspace-wide default permissions
      SELECT wdp.ws_id
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
  WITH CHECK (
    is_org_member(auth.uid(), ws_id) AND
    EXISTS (
      -- Check if user has manage_api_keys permission via role membership
      SELECT wrp.ws_id
      FROM workspace_role_members wrm
      JOIN workspace_role_permissions wrp
        ON wrp.role_id = wrm.role_id
        AND wrp.ws_id = workspace_api_keys.ws_id
      WHERE wrm.user_id = auth.uid()
        AND wrp.permission = 'manage_api_keys'
        AND wrp.enabled = true

      UNION

      -- Also check workspace-wide default permissions
      SELECT wdp.ws_id
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
  );

-- Allow workspace members with manage_api_keys permission to delete API keys
CREATE POLICY "Allow authorized members to delete API keys"
  ON "public"."workspace_api_keys"
  FOR DELETE
  TO authenticated
  USING (
    is_org_member(auth.uid(), ws_id) AND
    EXISTS (
      -- Check if user has manage_api_keys permission via role membership
      SELECT wrp.ws_id
      FROM workspace_role_members wrm
      JOIN workspace_role_permissions wrp
        ON wrp.role_id = wrm.role_id
        AND wrp.ws_id = workspace_api_keys.ws_id
      WHERE wrm.user_id = auth.uid()
        AND wrp.permission = 'manage_api_keys'
        AND wrp.enabled = true

      UNION

      -- Also check workspace-wide default permissions
      SELECT wdp.ws_id
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
  );

-- Add comments for documentation
COMMENT ON TABLE "public"."workspace_api_keys" IS 'API keys for external SDK authentication with role-based permissions';
COMMENT ON COLUMN "public"."workspace_api_keys"."key_hash" IS 'Scrypt hash of the API key for secure storage';
COMMENT ON COLUMN "public"."workspace_api_keys"."key_prefix" IS 'First 12 characters of key (ttr_xxxx) for identification without exposing full key';
COMMENT ON COLUMN "public"."workspace_api_keys"."role_id" IS 'Workspace role that determines permissions for this API key';
COMMENT ON COLUMN "public"."workspace_api_keys"."last_used_at" IS 'Timestamp of when this key was last used for API requests';
COMMENT ON COLUMN "public"."workspace_api_keys"."expires_at" IS 'Optional expiration date for the API key';
