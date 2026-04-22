import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

/**
 * Verifies the user is a workspace member and has `manage_api_keys` on the workspace.
 * Returns a NextResponse when the caller should return early, or null when access is allowed.
 */
export async function assertWorkspaceApiKeysAccess(
  supabase: TypedSupabaseClient,
  userId: string,
  wsId: string
): Promise<NextResponse | null> {
  const workspaceMember = await verifyWorkspaceMembershipType({
    wsId: wsId,
    userId: userId,
    supabase: supabase,
  });

  if (!workspaceMember) {
    return NextResponse.json(
      { message: "You don't have access to this workspace" },
      { status: 403 }
    );
  }

  const { data: hasPermission, error: permissionError } = await supabase.rpc(
    'has_workspace_permission',
    {
      p_user_id: userId,
      p_ws_id: wsId,
      p_permission: 'manage_api_keys',
    }
  );

  if (permissionError) {
    console.error(
      'Error checking manage_api_keys permission:',
      permissionError
    );
    return NextResponse.json(
      { message: 'Error checking permission' },
      { status: 500 }
    );
  }

  if (!hasPermission) {
    return NextResponse.json(
      { message: 'You do not have permission to manage API keys' },
      { status: 403 }
    );
  }

  return null;
}
