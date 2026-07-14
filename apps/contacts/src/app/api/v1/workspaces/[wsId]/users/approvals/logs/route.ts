import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { handleGetApprovalLogsRequest } from '@tuturuuu/users-core/routes/users/approvals/logs';
import type { ApprovalRouteParams } from '@tuturuuu/users-core/routes/users/approvals/route';

export async function GET(request: Request, context: ApprovalRouteParams) {
  const actor = await getSatelliteAppSessionUser('contacts');
  if (!actor?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return handleGetApprovalLogsRequest(request, context, actor);
}
