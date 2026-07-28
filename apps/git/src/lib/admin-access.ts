import 'server-only';

import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';

export async function requireGitAdmin() {
  const user = await getSatelliteAppSessionUser('git');
  if (!user?.id) {
    return null;
  }

  const permissions = await getPermissions({
    user,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (!permissions?.containsPermission('manage_git_repositories')) {
    return null;
  }

  return {
    db: await createAdminClient({ noCookie: true }),
    user,
  };
}
