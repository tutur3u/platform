import {
  externalAppWorkspaceCronScopes,
  handleExternalAppWorkspaceCronRoute,
  loadExternalAppWorkspaceCronExecutions,
} from '@/lib/external-apps/workspace-cron';

const ROUTE = '/api/v1/workspaces/[wsId]/external-apps/cron/executions';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  return handleExternalAppWorkspaceCronRoute({
    handler: (access) =>
      loadExternalAppWorkspaceCronExecutions({ access, request }),
    operation: 'history',
    request,
    requiredScopes: [externalAppWorkspaceCronScopes.cronRead],
    route: ROUTE,
    wsId,
  });
}
