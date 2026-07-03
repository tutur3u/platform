import { NextResponse } from 'next/server';
import { authorizeDevboxAgent } from '@/lib/devboxes/agent-auth';
import { shutdownDevboxRunner } from '@/lib/devboxes/agent-store';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

export async function POST(request: Request) {
  const authorization = await authorizeDevboxAgent(request);
  if (!authorization.ok) return authorization.response;

  try {
    return NextResponse.json(
      await shutdownDevboxRunner(authorization.runner.id)
    );
  } catch (error) {
    return createDevboxRouteErrorResponse(
      error,
      'Failed to shut down devbox runner'
    );
  }
}
