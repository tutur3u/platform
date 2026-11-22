import {
  externalAppWorkspaceMemberScopes,
  requireExternalAppWorkspaceMembersAccess,
  updateExternalAppWorkspaceMemberRole,
} from '@/lib/external-apps/workspace-members';

/** Scopes this route requires; the route-group rate limiter is tested against them. */
export const requiredScopes = [
  externalAppWorkspaceMemberScopes.membersWrite,
  externalAppWorkspaceMemberScopes.rolesWrite,
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string; wsId: string }> }
) {
  const { userId, wsId } = await params;
  const access = await requireExternalAppWorkspaceMembersAccess({
    capability: 'manage-roles',
    request,
    requiredScopes,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return updateExternalAppWorkspaceMemberRole({ access, request, userId });
}
