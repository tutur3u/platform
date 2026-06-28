import {
  externalAppWorkspaceCronScopes,
  requireExternalAppWorkspaceCronAccess,
  setupExternalAppWorkspaceCron,
} from '@/lib/external-apps/workspace-cron';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
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

  return setupExternalAppWorkspaceCron({ access, request });
}
