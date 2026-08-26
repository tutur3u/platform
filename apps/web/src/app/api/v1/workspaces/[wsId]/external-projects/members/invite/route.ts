import {
  inviteExternalProjectTeamMembers,
  requireExternalProjectTeamAccess,
  updateExternalProjectTeamInvitationRoles,
} from '@/lib/external-projects/team-access';

interface Params {
  params: Promise<{ wsId: string }>;
}

async function getAccess(request: Request, { params }: Params) {
  const { wsId } = await params;
  return requireExternalProjectTeamAccess({
    capability: 'manage-members',
    request,
    wsId,
  });
}

export async function POST(request: Request, context: Params) {
  const access = await getAccess(request, context);
  if (!access.ok) return access.response;
  return inviteExternalProjectTeamMembers({ access, request });
}

export async function PATCH(request: Request, context: Params) {
  const access = await getAccess(request, context);
  if (!access.ok) return access.response;
  return updateExternalProjectTeamInvitationRoles({ access, request });
}
