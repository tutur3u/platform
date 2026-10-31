import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { isExplicitGrantPermission } from '@tuturuuu/utils/explicit-grant-permissions';
import { filterCreatorGrantPermissions } from '@/lib/workspace-creator-grant-permissions';

export type WorkspaceRolePayload = {
  name: string;
  permissions: Array<{
    enabled: boolean;
    id: string;
  }>;
};

/**
 * CMS team editors write with the admin client. Drop creator-grant
 * permissions unless the caller is the workspace creator, and always drop
 * explicit-grant permissions (manage_mastermind): only the audited database
 * procedure may change those rows.
 */
export async function writableTeamRolePermissions(
  access: {
    admin: TypedSupabaseClient;
    normalizedWorkspaceId: string;
    user: { id: string };
  },
  permissions: WorkspaceRolePayload['permissions']
) {
  const writable = await filterCreatorGrantPermissions(access.admin, {
    permissions,
    userId: access.user.id,
    wsId: access.normalizedWorkspaceId,
  });
  return writable.filter(
    (permission) => !isExplicitGrantPermission(permission.id)
  );
}
