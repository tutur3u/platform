-- Transaction Permissions

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_expenses';
ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_incomes';