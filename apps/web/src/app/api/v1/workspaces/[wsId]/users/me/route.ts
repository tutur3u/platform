import { getCurrentWorkspaceUser } from '@tuturuuu/utils/user-helper';
import { NextResponse } from 'next/server';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

/**
 * Returns the current authenticated caller's workspace-user link for `wsId`
 * (including the `virtual_user_id` the user-scoped pages need). Wraps the shared
 * `getCurrentWorkspaceUser` helper, which resolves the caller from the request
 * session (RLS-respecting) and auto-repairs the link for members. Replaces the
 * direct `getCurrentWorkspaceUser()` server-component call for clients (e.g.
 * apps/tanstack-web) that cannot read Supabase directly.
 */
export async function GET(_request: Request, { params }: Params) {
  const { wsId } = await params;

  const workspaceUser = await getCurrentWorkspaceUser(wsId);
  if (!workspaceUser) {
    return NextResponse.json(
      { message: 'Current workspace user not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: workspaceUser });
}
