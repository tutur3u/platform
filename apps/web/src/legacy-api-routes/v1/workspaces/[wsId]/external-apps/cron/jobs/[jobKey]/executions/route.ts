import {
  externalAppWorkspaceCronScopes,
  handleExternalAppWorkspaceCronRoute,
  loadExternalAppWorkspaceCronExecutions,
} from '@/lib/external-apps/workspace-cron';

const ROUTE =
  '/api/v1/workspaces/[wsId]/external-apps/cron/jobs/[jobKey]/executions';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobKey: string; wsId: string }> }
) {
  const { jobKey, wsId } = await params;
  return handleExternalAppWorkspaceCronRoute({
    handler: (access) =>
      loadExternalAppWorkspaceCronExecutions({ access, jobKey, request }),
    operation: 'history',
    request,
    requiredScopes: [externalAppWorkspaceCronScopes.cronRead],
    route: ROUTE,
    wsId,
  });
}
