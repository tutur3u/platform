import {
  externalAppWorkspaceCronScopes,
  handleExternalAppWorkspaceCronRoute,
  runExternalAppWorkspaceCronJobNow,
} from '@/lib/external-apps/workspace-cron';

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
    requiredScopes: [
      externalAppWorkspaceCronScopes.cronRead,
      externalAppWorkspaceCronScopes.cronWrite,
    ],
    route: ROUTE,
    wsId,
  });
}
