-- Drop legacy 'value' column from workspace_api_keys
-- This migration completes the transition from plaintext API key storage
-- to secure hash-based storage (key_hash column)
--
-- Prerequisites:
-- 1. Migration 20251022040001_enhance_workspace_api_keys.sql has been applied
-- 2. All API keys have been migrated to use key_hash instead of value
-- 3. Application code no longer references the value field
-- 4. All existing API keys have been rotated or regenerated
--
-- Verification before running:
-- Run this query to ensure no keys are still using the legacy value field:
--   SELECT COUNT(*) FROM workspace_api_keys WHERE value IS NOT NULL AND key_hash IS NULL;
-- This should return 0 rows.
--
-- Safety: This is a destructive migration - the value column and its data will be permanently removed
-- Rollback: If rollback is needed, restore from backup as the data cannot be recovered

-- Drop the legacy value column
ALTER TABLE "public"."workspace_api_keys"
  DROP COLUMN IF EXISTS "value";

-- Update table comment to reflect the removal
COMMENT ON TABLE "public"."workspace_api_keys" IS 'API keys for external SDK authentication with role-based permissions. Uses secure scrypt-based key_hash storage.';
