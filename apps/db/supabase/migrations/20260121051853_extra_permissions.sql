-- Add update_user_attendance permission to workspace_role_permission enum
-- This permission controls who can update user attendance
-- Including: updating user attendance, creating user attendance, deleting user attendance

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'update_user_attendance';

-- Add report and posts CRUD permissions to workspace_role_permission enum
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'create_user_groups_reports';
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_user_groups_reports';
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'update_user_groups_reports';
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'delete_user_groups_reports';
