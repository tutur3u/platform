import {
  addExternalProjectRoleMembers,
  listExternalProjectRoleMembers,
  requireExternalProjectTeamAccess,
} from '@/lib/external-projects/team-access';

interface Params {
  params: Promise<{
    roleId: string;
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { roleId, wsId } = await params;
  const access = await requireExternalProjectTeamAccess({ request, wsId });

  if (!access.ok) {
    return access.response;
  }

  return listExternalProjectRoleMembers({ access, roleId });
}

export async function POST(request: Request, { params }: Params) {
  const { roleId, wsId } = await params;
  const access = await requireExternalProjectTeamAccess({
    capability: 'manage-roles',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return addExternalProjectRoleMembers({ access, request, roleId });
}
