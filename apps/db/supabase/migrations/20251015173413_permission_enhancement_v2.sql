ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_user_groups';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'create_user_groups';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'update_user_groups';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'delete_user_groups';


ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'view_user_groups_scores';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'create_user_groups_scores';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'update_user_groups_scores';

ALTER TYPE "workspace_role_permission" ADD VALUE IF NOT EXISTS 'delete_user_groups_scores';
