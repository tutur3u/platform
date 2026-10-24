import { NextResponse } from 'next/server';
import { reapStaleDevboxRuns } from '@/lib/devboxes/admin-runner-control';
import { authorizeDevboxRootAdmin } from '@/lib/devboxes/authorization';
import { createDevboxRouteErrorResponse } from '@/lib/devboxes/store-utils';

// Manual operator sweep of stale runs across the fleet, behind the same gate
// as runner drain and features. Scheduling it belongs to Cloudflare Cron
// Control under the billable-work rules; there is no cron route.
export async function POST(request: Request) {
  const authorization = await authorizeDevboxRootAdmin(request);
  if (!authorization.ok) return authorization.response;

  try {
    const result = await reapStaleDevboxRuns();
    if (result.reaped > 0)
      console.warn(`Reaped ${result.reaped} stale devbox run(s)`, {
        actorId: authorization.user.id,
      });
    return NextResponse.json(result);
  } catch (error) {
    return createDevboxRouteErrorResponse(
      error,
      'Failed to reap stale devbox runs'
    );
  }
}
