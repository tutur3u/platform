import { NextResponse } from 'next/server';
import {
  createRouteErrorResponse,
  getExternalProjectTeamDefaultPermissions,
  parseExternalProjectTeamMemberType,
  requireExternalProjectTeamAccess,
  updateExternalProjectTeamDefaultPermissions,
} from '@/lib/external-projects/team-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const memberType = await parseExternalProjectTeamMemberType(request);

  if (!memberType.ok) {
    return memberType.response;
  }

  const access = await requireExternalProjectTeamAccess({ request, wsId });

  if (!access.ok) {
    return access.response;
  }

  try {
    return NextResponse.json(
      await getExternalProjectTeamDefaultPermissions({
        access,
        memberType: memberType.memberType,
      })
    );
  } catch (error) {
    return createRouteErrorResponse('Error loading CMS default access', error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { wsId } = await params;
  const memberType = await parseExternalProjectTeamMemberType(request);

  if (!memberType.ok) {
    return memberType.response;
  }

  const access = await requireExternalProjectTeamAccess({
    capability: 'manage-roles',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return updateExternalProjectTeamDefaultPermissions({
    access,
    memberType: memberType.memberType,
    payload: await request.json(),
  });
}
