import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { handleGetUserEmailsRequest } from '@tuturuuu/users-core/routes/users/user-emails';
import { createLegacyHeadHandler } from '@/lib/legacy-head';

type Params = Parameters<typeof handleGetUserEmailsRequest>[1];

export async function GET(request: Request, context: Params) {
  const actor = await getSatelliteAppSessionUser('contacts');
  if (!actor?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return handleGetUserEmailsRequest(request, context, actor);
}

export const HEAD = createLegacyHeadHandler(GET);
