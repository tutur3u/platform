import { NextResponse } from 'next/server';
import {
  externalAppWorkspaceMemberScopes,
  loadExternalAppWorkspaceMembers,
  requireExternalAppWorkspaceMembersAccess,
} from '@/lib/external-apps/workspace-members';

/** Scopes this route requires; the route-group rate limiter is tested against them. */
export const requiredScopes = [
  externalAppWorkspaceMemberScopes.membersRead,
  externalAppWorkspaceMemberScopes.rolesRead,
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireExternalAppWorkspaceMembersAccess({
    request,
    requiredScopes,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return NextResponse.json(await loadExternalAppWorkspaceMembers(access));
}
