-- Add analytics permissions to workspace_role_permission enum
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_analytics';
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'manage_analytics';
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'manage_experiments';
