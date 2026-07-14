import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  type ApprovalRouteParams,
  handleGetApprovalsRequest,
  handlePutApprovalsRequest,
} from '@tuturuuu/users-core/routes/users/approvals/route';

async function getActor() {
  return getSatelliteAppSessionUser('contacts');
}

export async function GET(request: Request, context: ApprovalRouteParams) {
  const actor = await getActor();
  if (!actor?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return handleGetApprovalsRequest(request, context, actor);
}

export async function PUT(request: Request, context: ApprovalRouteParams) {
  const actor = await getActor();
  if (!actor?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return handlePutApprovalsRequest(request, context, actor);
}
