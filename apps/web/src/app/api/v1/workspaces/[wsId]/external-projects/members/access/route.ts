import {
  removeExternalProjectTeamMember,
  requireExternalProjectTeamAccess,
} from '@/lib/external-projects/team-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function DELETE(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await requireExternalProjectTeamAccess({
    capability: 'manage-members',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return removeExternalProjectTeamMember({ access, request });
}
