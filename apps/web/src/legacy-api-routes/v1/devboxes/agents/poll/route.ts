import { NextResponse } from 'next/server';
import { authorizeDevboxAgent } from '@/lib/devboxes/agent-auth';
import { claimNextDevboxRun } from '@/lib/devboxes/agent-store';
import {
  createDevboxAgentApiDisabledResponse,
  isDevboxAgentApiEnabled,
} from '@/lib/devboxes/agent-traffic-gate';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

export async function GET(request: Request) {
  if (!isDevboxAgentApiEnabled()) {
    return createDevboxAgentApiDisabledResponse();
  }

  const authorization = await authorizeDevboxAgent(request, {
    requireOnline: true,
  });
  if (!authorization.ok) return authorization.response;

  try {
    const job = await claimNextDevboxRun(authorization.runner.id);
    return NextResponse.json({ jobs: job ? [job] : [] });
  } catch (error) {
    return createDevboxRouteErrorResponse(error, 'Failed to claim devbox run');
  }
}
