import type { TypedSupabaseClient } from '@tuturuuu/supabase/next/client';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { User, UserPrivateDetails } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { getWorkspaceUserLinkForUser } from './workspace-user-link';

async function resolveCurrentUserId(
  supabase: TypedSupabaseClient
): Promise<string | null> {
  try {
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();

    if (!claimsError && claimsData?.claims?.sub) {
      return claimsData.claims.sub;
    }
  } catch {
    console.warn(
      '[resolveCurrentUserId] getClaims is unavailable, falling back to getUser. This may be expected in testing environments or older Supabase clients.'
    );
    // Fall back to getUser when getClaims is unavailable in mocks/older clients.
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

export async function getCurrentSupabaseUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export interface WorkspaceUserLink {
  platform_user_id: string;
  virtual_user_id: string;
  ws_id: string;
  created_at: string;
  workspace_users?: WorkspaceUser;
}

export interface GetCurrentWorkspaceUserOptions {
  /**
   * If true (default), automatically creates a missing workspace_user_linked_users entry
   * when a workspace member doesn't have one. This uses the ensure_workspace_user_link RPC.
   */
  autoRepair?: boolean;
}

/**
 * Gets the current user's workspace user link for the specified workspace.
 * Optionally auto-repairs missing links (enabled by default).
 *
 * @param wsId - The workspace ID (can be a UUID or special identifier like 'personal')
 * @param options - Configuration options
 * @returns The workspace user link with optional nested workspace_users data, or null if not found
 */
export async function getCurrentWorkspaceUser(
  wsId: string,
  options: GetCurrentWorkspaceUserOptions = {}
): Promise<WorkspaceUserLink | null> {
  const supabase = await createClient();
  const userId = await resolveCurrentUserId(supabase as TypedSupabaseClient);
  if (!userId) return null;

  // The link lookup + auto-repair lives in workspace-user-link so satellite apps
  // can reuse it with an app-session actor: the internal-app-auth guard forbids
  // registered apps from importing this module (it resolves actors via Supabase).
  return getWorkspaceUserLinkForUser(wsId, userId, options);
}

export async function getCurrentUser() {
  const supabase = await createClient();

  const userId = await resolveCurrentUserId(supabase as TypedSupabaseClient);

  if (!userId) {
    return null;
  }

  const { data, error } = await supabase
    .from('users')
    .select(
      'id, display_name, avatar_url, bio, handle, created_at, user_private_details(email, new_email, birthday, full_name, default_workspace_id)'
    )
    .eq('id', userId)
    .single();

  if (error) {
    console.error('Error getting user:', error);
    return null;
  }

  const { user_private_details, ...rest } = data;
  return { ...rest, ...user_private_details } as
    | (User & UserPrivateDetails)
    | WorkspaceUser;
}

export async function getUserDefaultWorkspace(client?: TypedSupabaseClient) {
  try {
    const supabase = client || (await createClient());

    const userId = await resolveCurrentUserId(supabase as TypedSupabaseClient);

    if (!userId) return null;

    const { data: userData, error: userError } = await supabase
      .from('user_private_details')
      .select('default_workspace_id')
      .eq('user_id', userId)
      .single();

    if (userError || !userData) return null;

    const defaultWorkspaceId = userData.default_workspace_id;

    // If user has a default workspace set, validate it exists and user has access
    if (defaultWorkspaceId) {
      const { data: workspace, error } = await supabase
        .from('workspaces')
        .select('id, name, personal, workspace_members!inner(user_id)')
        .eq('id', defaultWorkspaceId)
        .eq('workspace_members.user_id', userId)
        .single();

      if (!error && workspace) {
        return workspace;
      }
    }

    // If no default workspace or invalid, get the personal workspace
    const { data: personalWorkspace, error } = await supabase
      .from('workspaces')
      .select('id, name, personal, workspace_members!inner(user_id)')
      .eq('workspace_members.user_id', userId)
      .eq('personal', true)
      .limit(1)
      .maybeSingle();

    if (error || !personalWorkspace) {
      return null;
    }

    return personalWorkspace;
  } catch (error) {
    console.error('Error getting user default workspace:', error);
    return null;
  }
}

export async function updateUserDefaultWorkspace(
  workspaceId: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || (await createClient());

  const userId = await resolveCurrentUserId(supabase as TypedSupabaseClient);

  if (!userId) return { error: 'User not found' };

  // Verify user has access to the workspace
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id, workspace_members!inner(user_id)')
    .eq('id', workspaceId)
    .eq('workspace_members.user_id', userId)
    .single();

  if (workspaceError || !workspace) {
    return { error: 'Workspace not found or access denied' };
  }

  // Update the user's default workspace
  const { error } = await supabase
    .from('user_private_details')
    .update({ default_workspace_id: workspaceId })
    .eq('user_id', userId);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

// Function to fetch workspace users
export async function fetchWorkspaceUsers(
  wsId: string
): Promise<WorkspaceUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspace_users')
    .select('id, full_name, email, avatar_url')
    .eq('ws_id', wsId)
    .order('full_name', { ascending: true });

  if (error) throw error;
  return data || [];
}
