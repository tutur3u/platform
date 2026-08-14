import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { handleBulkImportWorkspaceUsersRequest } from '@tuturuuu/users-core/routes/users/bulk-import';

type Params = Parameters<typeof handleBulkImportWorkspaceUsersRequest>[1];

export async function POST(request: Request, context: Params) {
  const actor = await getSatelliteAppSessionUser('contacts');
  if (!actor?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return handleBulkImportWorkspaceUsersRequest(request, context, actor);
}
