import {
  externalAppWorkspaceCronScopes,
  handleExternalAppWorkspaceCronRoute,
  loadExternalAppWorkspaceCronExecutions,
} from '@/lib/external-apps/workspace-cron';

/** Scopes this route requires; the route-group rate limiter is tested against them. */
export const requiredScopes = [externalAppWorkspaceCronScopes.cronRead];

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
    requiredScopes,
    route: ROUTE,
    wsId,
  });
}
