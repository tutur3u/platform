import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  handleListWorkspaceUserFieldsRequest,
  type WorkspaceUserFieldsParams,
} from '@tuturuuu/users-core/routes/users/fields';
import { connection } from 'next/server';
import { createLegacyHeadHandler } from '@/lib/legacy-head';

export async function GET(
  request: Request,
  context: WorkspaceUserFieldsParams
) {
  await connection();

  const actor = await getSatelliteAppSessionUser('contacts');
  if (!actor?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return handleListWorkspaceUserFieldsRequest(request, context, actor);
}

export const HEAD = createLegacyHeadHandler(GET);
