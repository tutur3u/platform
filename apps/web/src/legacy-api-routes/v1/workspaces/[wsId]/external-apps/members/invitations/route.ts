import {
  externalAppWorkspaceMemberScopes,
  inviteExternalAppWorkspaceMembers,
  requireExternalAppWorkspaceMembersAccess,
} from '@/lib/external-apps/workspace-members';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireExternalAppWorkspaceMembersAccess({
    capability: 'manage-members',
    request,
    requiredScopes: [externalAppWorkspaceMemberScopes.membersWrite],
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return inviteExternalAppWorkspaceMembers({ access, request });
}
