import { NextResponse } from 'next/server';
import { authorizeDevboxAgent } from '@/lib/devboxes/agent-auth';
import { heartbeatDevboxRunner } from '@/lib/devboxes/agent-store';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

export async function POST(request: Request) {
  const authorization = await authorizeDevboxAgent(request);
  if (!authorization.ok) return authorization.response;

  try {
    return NextResponse.json(
      await heartbeatDevboxRunner(authorization.runner.id)
    );
  } catch (error) {
    return createDevboxRouteErrorResponse(
      error,
      'Failed to record devbox heartbeat'
    );
  }
}
