import { NextResponse } from 'next/server';
import {
  createRouteErrorResponse,
  deleteExternalProjectTeamRole,
  getExternalProjectTeamRole,
  requireExternalProjectTeamAccess,
  updateExternalProjectTeamRole,
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

  try {
    return NextResponse.json(
      await getExternalProjectTeamRole({ access, roleId })
    );
  } catch (error) {
    return createRouteErrorResponse('Error loading CMS access level', error);
  }
}

export async function PUT(request: Request, { params }: Params) {
  const { roleId, wsId } = await params;
  const access = await requireExternalProjectTeamAccess({
    capability: 'manage-roles',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return updateExternalProjectTeamRole({
    access,
    payload: await request.json(),
    roleId,
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const { roleId, wsId } = await params;
  const access = await requireExternalProjectTeamAccess({
    capability: 'manage-roles',
    request,
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return deleteExternalProjectTeamRole({ access, roleId });
}
