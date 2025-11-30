import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

/**
 * Check if the current user has the manage_changelog permission.
 *
 * This checks:
 * 1. If the user is the creator of the root workspace (has all permissions)
 * 2. If the user has manage_changelog permission via their assigned roles
 * 3. If the user has manage_changelog via workspace default permissions
 */
export async function checkChangelogPermission(supabase: TypedSupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false, user: null };
  }

  // Check if user is the creator of root workspace (has all permissions)
  const { data: workspaceData } = await supabase
    .from('workspaces')
    .select('creator_id')
    .eq('id', ROOT_WORKSPACE_ID)
    .single();

  if (workspaceData?.creator_id === user.id) {
    return { authorized: true, user };
  }

  // Check if user has manage_changelog permission via roles
  const { data: rolePermission } = await supabase
    .from('workspace_role_members')
    .select(
      'workspace_roles!inner(workspace_role_permissions!inner(permission))'
    )
    .eq('user_id', user.id)
    .eq('workspace_roles.ws_id', ROOT_WORKSPACE_ID)
    .eq(
      'workspace_roles.workspace_role_permissions.permission',
      'manage_changelog'
    )
    .eq('workspace_roles.workspace_role_permissions.enabled', true)
    .maybeSingle();

  if (rolePermission) {
    return { authorized: true, user };
  }

  // Check if user has manage_changelog via default permissions
  const { data: memberCheck } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('user_id', user.id)
    .maybeSingle();

  if (memberCheck) {
    const { data: defaultPermission } = await supabase
      .from('workspace_default_permissions')
      .select('permission')
      .eq('ws_id', ROOT_WORKSPACE_ID)
      .eq('permission', 'manage_changelog')
      .eq('enabled', true)
      .maybeSingle();

    if (defaultPermission) {
      return { authorized: true, user };
    }
  }

  return { authorized: false, user };
}
