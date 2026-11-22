import {
  externalAppWorkspaceCronScopes,
  handleExternalAppWorkspaceCronRoute,
  runExternalAppWorkspaceCronJobNow,
} from '@/lib/external-apps/workspace-cron';

/** Scopes this route requires; the route-group rate limiter is tested against them. */
export const requiredScopes = [
  externalAppWorkspaceCronScopes.cronRead,
  externalAppWorkspaceCronScopes.cronWrite,
];

const ROUTE =
  '/api/v1/workspaces/[wsId]/external-apps/cron/jobs/[jobKey]/run-now';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobKey: string; wsId: string }> }
) {
  const { jobKey, wsId } = await params;
  return handleExternalAppWorkspaceCronRoute({
    handler: (access) => runExternalAppWorkspaceCronJobNow({ access, jobKey }),
    operation: 'run_now',
    request,
    requiredScopes,
    route: ROUTE,
    wsId,
  });
}
