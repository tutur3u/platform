-- Add manage_changelog permission for platform-wide changelog management
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'manage_changelog';
