import {
  externalAppWorkspaceCronScopes,
  handleExternalAppWorkspaceCronRoute,
  updateExternalAppWorkspaceCronJob,
} from '@/lib/external-apps/workspace-cron';

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
    requiredScopes: [
      externalAppWorkspaceCronScopes.cronRead,
      externalAppWorkspaceCronScopes.cronWrite,
    ],
    route: ROUTE,
    wsId,
  });
}
