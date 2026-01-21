-- Transaction Permissions

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_expenses';
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_incomes';

-- Wallet Permissions
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'create_wallets';
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'update_wallets';
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'delete_wallets';