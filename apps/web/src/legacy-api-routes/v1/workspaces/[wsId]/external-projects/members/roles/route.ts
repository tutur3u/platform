import { NextResponse } from 'next/server';
import {
  createExternalProjectTeamRole,
  createRouteErrorResponse,
  listExternalProjectTeamRoles,
  requireExternalProjectTeamAccess,
} from '@/lib/external-projects/team-access';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await requireExternalProjectTeamAccess({ request, wsId });

  if (!access.ok) {
    return access.response;
  }

  try {
    return NextResponse.json(await listExternalProjectTeamRoles(access));
  } catch (error) {
    return createRouteErrorResponse('Error loading CMS access levels', error);
  }
}

export async function POST(request: Request, { params }: Params) {
  const { wsId } = await params;
  const access = await requireExternalProjectTeamAccess({
    capability: 'manage-roles',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return createExternalProjectTeamRole({
    access,
    payload: await request.json(),
  });
}
