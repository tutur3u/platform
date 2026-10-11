import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  handleDeleteWorkspaceUserRequest,
  handleGetWorkspaceUserRequest,
  handleUpdateWorkspaceUserRequest,
  type WorkspaceUserMutationParams,
} from '@tuturuuu/users-core/routes/users/workspace-user';

import { connection } from 'next/server';

async function getActor() {
  return getSatelliteAppSessionUser('contacts');
}

export async function GET(
  request: Request,
  context: WorkspaceUserMutationParams
) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    await connection();
    const actor = await getActor();
    if (!actor?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
    }

    return await handleGetWorkspaceUserRequest(request, context, actor);
  } catch {
    return Response.json(
      { message: 'Error fetching workspace user' },
      { status: 500, headers }
    );
  }
}

export async function PUT(
  request: Request,
  context: WorkspaceUserMutationParams
) {
  const actor = await getActor();
  if (!actor?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handleUpdateWorkspaceUserRequest(request, context, actor);
}

export async function DELETE(
  request: Request,
  context: WorkspaceUserMutationParams
) {
  const actor = await getActor();
  if (!actor?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handleDeleteWorkspaceUserRequest(request, context, actor);
}
