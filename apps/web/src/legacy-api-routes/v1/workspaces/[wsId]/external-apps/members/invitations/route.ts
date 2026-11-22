import {
  externalAppWorkspaceMemberScopes,
  inviteExternalAppWorkspaceMembers,
  requireExternalAppWorkspaceMembersAccess,
} from '@/lib/external-apps/workspace-members';

/** Scopes this route requires; the route-group rate limiter is tested against them. */
export const requiredScopes = [externalAppWorkspaceMemberScopes.membersWrite];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireExternalAppWorkspaceMembersAccess({
    capability: 'manage-members',
    request,
    requiredScopes,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return inviteExternalAppWorkspaceMembers({ access, request });
}
