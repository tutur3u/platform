-- Batch 1 of new permissions

-- Run each of these as a separate command
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_users_private_info';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_users_public_info';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_finance_stats';

-- Batch 2 of new permissions

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'create_users';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'update_users';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'delete_users';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'check_user_attendance';

-- Batch 3 of new permissions
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'create_inventory';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'update_inventory';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'delete_inventory';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_inventory';


-- Batch 4 of new permissions
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_transactions';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'create_transactions';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'update_transactions';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'delete_transactions';

-- Batch 5 of new permissions

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_invoices';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'create_invoices';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'update_invoices';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'delete_invoices';
