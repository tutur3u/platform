import { NextResponse } from 'next/server';
import { authorizeDevboxAgent } from '@/lib/devboxes/agent-auth';
import { claimNextDevboxRun } from '@/lib/devboxes/agent-store';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

export async function GET(request: Request) {
  const authorization = await authorizeDevboxAgent(request);
  if (!authorization.ok) return authorization.response;

  try {
    const job = await claimNextDevboxRun(authorization.runner.id);
    return NextResponse.json({ jobs: job ? [job] : [] });
  } catch (error) {
    return createDevboxRouteErrorResponse(error, 'Failed to claim devbox run');
  }
}
