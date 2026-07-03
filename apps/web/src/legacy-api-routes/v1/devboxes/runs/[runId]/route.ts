import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getDevboxRun } from '@/lib/devboxes/agent-store';
import { authorizeDevboxRootMember } from '@/lib/devboxes/authorization';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  const authorization = await authorizeDevboxRootMember(request);
  if (!authorization.ok) return authorization.response;

  const { runId } = await context.params;

  try {
    return NextResponse.json(
      await getDevboxRun({
        actorId: authorization.user.id,
        runId,
      })
    );
  } catch (error) {
    return createDevboxRouteErrorResponse(error, 'Failed to get devbox run');
  }
}
