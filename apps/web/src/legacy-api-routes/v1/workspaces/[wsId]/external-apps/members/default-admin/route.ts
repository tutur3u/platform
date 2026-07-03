import {
  externalAppWorkspaceMemberScopes,
  requireExternalAppWorkspaceMembersAccess,
  updateExternalAppWorkspaceDefaultAdmin,
} from '@/lib/external-apps/workspace-members';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
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

  return updateExternalAppWorkspaceDefaultAdmin({ access, request });
}
