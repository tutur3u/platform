import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { GET } from '@tuturuuu/users-core/routes/users/list';
import {
  handleCreateWorkspaceUserRequest,
  type WorkspaceUserCollectionParams,
} from '@tuturuuu/users-core/routes/users/workspace-user-create';
import { createLegacyHeadHandler } from '@/lib/legacy-head';

export { GET };
export const HEAD = createLegacyHeadHandler(GET);

export async function POST(
  request: Request,
  context: WorkspaceUserCollectionParams
) {
  const actor = await getSatelliteAppSessionUser('contacts');
  if (!actor?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handleCreateWorkspaceUserRequest(request, context, actor);
}
