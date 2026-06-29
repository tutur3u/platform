import {
  externalAppWorkspaceCronScopes,
  handleExternalAppWorkspaceCronRoute,
  setupExternalAppWorkspaceCron,
} from '@/lib/external-apps/workspace-cron';

const ROUTE = '/api/v1/workspaces/[wsId]/external-apps/cron/setup';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  return handleExternalAppWorkspaceCronRoute({
    handler: (access) => setupExternalAppWorkspaceCron({ access, request }),
    operation: 'setup',
    request,
    requiredScopes: [
      externalAppWorkspaceCronScopes.cronRead,
      externalAppWorkspaceCronScopes.cronWrite,
    ],
    route: ROUTE,
    wsId,
  });
}
