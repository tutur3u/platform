import {
  externalAppWorkspaceCronScopes,
  handleExternalAppWorkspaceCronRoute,
  setupExternalAppWorkspaceCron,
} from '@/lib/external-apps/workspace-cron';

/** Scopes this route requires; the route-group rate limiter is tested against them. */
export const requiredScopes = [
  externalAppWorkspaceCronScopes.cronRead,
  externalAppWorkspaceCronScopes.cronWrite,
];

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
    requiredScopes,
    route: ROUTE,
    wsId,
  });
}
