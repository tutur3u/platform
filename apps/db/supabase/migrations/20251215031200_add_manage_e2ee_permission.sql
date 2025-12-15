-- Add manage_e2ee permission to workspace_role_permission enum
-- This permission controls who can manage end-to-end encryption settings for the workspace
-- Including: generating encryption keys, rotating keys, enabling/disabling E2EE, and fixing encryption issues

ALTER TYPE "public"."workspace_role_permission" ADD VALUE IF NOT EXISTS 'manage_e2ee';
