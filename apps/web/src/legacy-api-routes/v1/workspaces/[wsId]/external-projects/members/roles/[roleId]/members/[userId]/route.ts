import {
  removeExternalProjectRoleMember,
  requireExternalProjectTeamAccess,
} from '@/lib/external-projects/team-access';

interface Params {
  params: Promise<{
    roleId: string;
    userId: string;
    wsId: string;
  }>;
}

export async function DELETE(request: Request, { params }: Params) {
  const { roleId, userId, wsId } = await params;
  const access = await requireExternalProjectTeamAccess({
    capability: 'manage-roles',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return removeExternalProjectRoleMember({ access, roleId, userId });
}
