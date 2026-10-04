import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { createWorkspaceUserAvatarUploadUrl } from '@tuturuuu/internal-api/profile-media';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { handleGetAvatarRequest } from '@tuturuuu/users-core/routes/users/avatar';
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
  const { wsId } = await context.params;
  const body = await request.json().catch(() => null);
  const access = createAppSessionToken({
    userId: actor.id,
    targetApp: 'platform',
    originApp: 'contacts',
    scopes: ['users:profile:write'],
    expiresInSeconds: 60,
  });
  try {
    return Response.json(
      await createWorkspaceUserAvatarUploadUrl(wsId, body?.contentType, {
        defaultHeaders: { Authorization: `Bearer ${access.token}` },
      }),
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    return Response.json(
      { message: 'Avatar upload unavailable' },
      { status: error instanceof InternalApiError ? error.status : 503 }
    );
  }
}

export const HEAD = createLegacyHeadHandler(GET);
