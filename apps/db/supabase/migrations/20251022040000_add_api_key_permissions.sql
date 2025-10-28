-- Add new permissions to the workspace_role_permission enum for API key management
-- These must be in a separate migration from their usage due to PostgreSQL enum limitations

ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'manage_api_keys';
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'manage_drive';
ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'manage_documents';
