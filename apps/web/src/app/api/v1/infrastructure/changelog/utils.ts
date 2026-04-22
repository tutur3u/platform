import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';

/**
 * Check if the current user has the manage_changelog permission.
 *
 * Delegates to `getPermissions` for root workspace (creator, role grants,
 * default permissions, membership gate).
 */
export async function checkChangelogPermission(supabase: TypedSupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false, user: null };
  }

  const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });

  if (!permissions?.containsPermission('manage_changelog')) {
    return { authorized: false, user };
  }

  return { authorized: true, user };
}
