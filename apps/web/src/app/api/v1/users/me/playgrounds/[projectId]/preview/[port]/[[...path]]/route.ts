import {
  playgroundCapabilityResponse,
  playgroundPreviewResponse,
} from '@tuturuuu/storage-core/playground-preview';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { playgroundAuth, playgroundId } from '../../../../route-utils';

const authenticatedGET = withSessionAuth<{
  projectId: string;
  port: string;
  path?: string[];
}>(async (req, { user }, params) => {
  await connection();
  try {
    const id = playgroundId(params.projectId);
    const response = await playgroundPreviewResponse({
      ownerId: user.id,
      projectId: id,
      port: Number(params.port),
      path: `/${(params.path ?? []).map(encodeURIComponent).join('/')}${new URL(req.url).search}`,
      prefix: `/api/v1/users/me/playgrounds/${id}/preview/${params.port}/`,
    });
    return new NextResponse(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch {
    return new NextResponse('Preview unavailable', {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}, playgroundAuth);

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ projectId: string; port: string; path?: string[] }>;
  }
) {
  await connection();
  const params = await context.params;
  const capability = await playgroundCapabilityResponse({
    request,
    projectId: params.projectId,
    port: Number(params.port),
    path: params.path ?? [],
    prefix: `/api/v1/users/me/playgrounds/${encodeURIComponent(params.projectId)}/preview/${params.port}/`,
  });
  return capability ?? authenticatedGET(request, context);
}
