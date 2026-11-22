import {
  externalAppWorkspaceCronScopes,
  handleExternalAppWorkspaceCronRoute,
  updateExternalAppWorkspaceCronJob,
} from '@/lib/external-apps/workspace-cron';

/** Scopes this route requires; the route-group rate limiter is tested against them. */
export const requiredScopes = [
  externalAppWorkspaceCronScopes.cronRead,
  externalAppWorkspaceCronScopes.cronWrite,
];

const ROUTE = '/api/v1/workspaces/[wsId]/external-apps/cron/jobs/[jobKey]';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobKey: string; wsId: string }> }
) {
  const { jobKey, wsId } = await params;
  return handleExternalAppWorkspaceCronRoute({
    handler: (access) =>
      updateExternalAppWorkspaceCronJob({ access, jobKey, request }),
    operation: 'job_update',
    request,
    requiredScopes,
    route: ROUTE,
    wsId,
  });
}
