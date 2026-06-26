import { NextResponse } from 'next/server';
import {
  externalAppWorkspaceMemberScopes,
  loadExternalAppWorkspaceMembers,
  requireExternalAppWorkspaceMembersAccess,
} from '@/lib/external-apps/workspace-members';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireExternalAppWorkspaceMembersAccess({
    request,
    requiredScopes: [
      externalAppWorkspaceMemberScopes.membersRead,
      externalAppWorkspaceMemberScopes.rolesRead,
    ],
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return NextResponse.json(await loadExternalAppWorkspaceMembers(access));
}
