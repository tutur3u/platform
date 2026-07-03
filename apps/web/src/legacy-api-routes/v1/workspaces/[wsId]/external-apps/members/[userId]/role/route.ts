import {
  externalAppWorkspaceMemberScopes,
  requireExternalAppWorkspaceMembersAccess,
  updateExternalAppWorkspaceMemberRole,
} from '@/lib/external-apps/workspace-members';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string; wsId: string }> }
) {
  const { userId, wsId } = await params;
  const access = await requireExternalAppWorkspaceMembersAccess({
    capability: 'manage-roles',
    request,
    requiredScopes: [
      externalAppWorkspaceMemberScopes.membersWrite,
      externalAppWorkspaceMemberScopes.rolesWrite,
    ],
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return updateExternalAppWorkspaceMemberRole({ access, request, userId });
}
