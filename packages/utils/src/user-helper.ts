import { createClient } from '@ncthub/supabase/next/server';
import { WorkspaceUser } from '@ncthub/types/primitives/WorkspaceUser';
import { notFound, redirect } from 'next/navigation';

export async function getCurrentSupabaseUser() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentUser(noRedirect?: boolean) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (noRedirect) return null;
    redirect('/login');
  }

  const { data, error } = await supabase
    .from('users')
    .select(
      'id, display_name, avatar_url, bio, handle, created_at, user_private_details(email, new_email, birthday, full_name, default_workspace_id)'
    )
    .eq('id', user.id)
    .single();

  if (error) notFound();
  const { user_private_details, ...rest } = data;
  return { ...rest, ...user_private_details } as WorkspaceUser;
}

export async function getUserDefaultWorkspace() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const { data: userData, error: userError } = await supabase
      .from('user_private_details')
      .select('default_workspace_id')
      .eq('user_id', user.id)
      .single();

    if (userError || !userData) return null;

    const defaultWorkspaceId = userData.default_workspace_id;

    // If user has a default workspace set, validate it exists and user has access
    if (defaultWorkspaceId) {
      const { data: workspace, error } = await supabase
        .from('workspaces')
        .select('id, name, workspace_members!inner(role)')
        .eq('id', defaultWorkspaceId)
        .eq('workspace_members.user_id', user.id)
        .single();

      if (!error && workspace) {
        return workspace;
      }
    }

    // If no default workspace or invalid, get the first available workspace
    const { data: workspaces, error } = await supabase
      .from('workspaces')
      .select('id, name, workspace_members!inner(role)')
      .eq('workspace_members.user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (error || !workspaces) {
      return null;
    }

    return workspaces;
  } catch (error) {
    console.error('Error getting user default workspace:', error);
    return null;
  }
}

export async function updateUserDefaultWorkspace(workspaceId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: 'User not found' };

  const supabase = await createClient();

  // Verify user has access to the workspace
  const { data: workspace, error: workspaceError } = await supabase
    .from('workspaces')
    .select('id, workspace_members!inner(role)')
    .eq('id', workspaceId)
    .eq('workspace_members.user_id', user.id)
    .single();

  if (workspaceError || !workspace) {
    return { error: 'Workspace not found or access denied' };
  }

  // Update the user's default workspace
  const { error } = await supabase
    .from('user_private_details')
    .update({ default_workspace_id: workspaceId })
    .eq('user_id', user.id);

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
