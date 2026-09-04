import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import {
  handleCreateAvatarUploadRequest,
  handleGetAvatarRequest,
} from '@tuturuuu/users-core/routes/users/avatar';
import { createLegacyHeadHandler } from '@/lib/legacy-head';

type Params = Parameters<typeof handleGetAvatarRequest>[1];

async function getActor() {
  return getSatelliteAppSessionUser('contacts');
}

export async function GET(request: Request, context: Params) {
  const actor = await getActor();
  if (!actor?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return handleGetAvatarRequest(request, context, actor);
}

export async function POST(request: Request, context: Params) {
  const actor = await getActor();
  if (!actor?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return handleCreateAvatarUploadRequest(request, context, actor);
}

export const HEAD = createLegacyHeadHandler(GET);
