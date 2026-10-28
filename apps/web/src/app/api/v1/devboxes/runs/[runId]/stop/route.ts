import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { requireDevboxActor } from '@/lib/devboxes/authorization';
import { stopDevboxRun } from '@/lib/devboxes/store';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runId: string }> }
) {
  const authorization = await requireDevboxActor(request);
  if (!authorization.ok) return authorization.response;

  const { runId } = await context.params;

  try {
    return NextResponse.json(
      await stopDevboxRun({ actorId: authorization.user.id, runId })
    );
  } catch (error) {
    return createDevboxRouteErrorResponse(error, 'Failed to stop devbox run');
  }
}
