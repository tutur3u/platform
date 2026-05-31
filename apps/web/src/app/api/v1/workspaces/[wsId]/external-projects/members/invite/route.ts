import {
  inviteExternalProjectTeamMembers,
  requireExternalProjectTeamAccess,
} from '@/lib/external-projects/team-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await requireExternalProjectTeamAccess({
    capability: 'manage-members',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return inviteExternalProjectTeamMembers({ access, request });
}
