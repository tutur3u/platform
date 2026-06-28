import {
  externalAppWorkspaceCronScopes,
  requireExternalAppWorkspaceCronAccess,
  runExternalAppWorkspaceCronJobNow,
} from '@/lib/external-apps/workspace-cron';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobKey: string; wsId: string }> }
) {
  const { jobKey, wsId } = await params;
  const access = await requireExternalAppWorkspaceCronAccess({
    request,
    requiredScopes: [
      externalAppWorkspaceCronScopes.cronRead,
      externalAppWorkspaceCronScopes.cronWrite,
    ],
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return runExternalAppWorkspaceCronJobNow({ access, jobKey });
}
