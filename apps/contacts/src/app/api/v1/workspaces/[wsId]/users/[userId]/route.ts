import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  handleDeleteWorkspaceUserRequest,
  handleUpdateWorkspaceUserRequest,
  type WorkspaceUserMutationParams,
} from '@tuturuuu/users-core/routes/users/workspace-user';

async function getActor() {
  return getSatelliteAppSessionUser('contacts');
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
