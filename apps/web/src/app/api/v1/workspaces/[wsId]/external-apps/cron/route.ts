import {
  externalAppWorkspaceCronScopes,
  handleExternalAppWorkspaceCronRoute,
  loadExternalAppWorkspaceCron,
} from '@/lib/external-apps/workspace-cron';

const ROUTE = '/api/v1/workspaces/[wsId]/external-apps/cron';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  return handleExternalAppWorkspaceCronRoute({
    handler: async (access) =>
      Response.json(await loadExternalAppWorkspaceCron(access)),
    operation: 'status',
    request,
    requiredScopes: [externalAppWorkspaceCronScopes.cronRead],
    route: ROUTE,
    wsId,
  });
}
