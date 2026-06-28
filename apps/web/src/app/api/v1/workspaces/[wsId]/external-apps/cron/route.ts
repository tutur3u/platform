import {
  externalAppWorkspaceCronScopes,
  loadExternalAppWorkspaceCron,
  requireExternalAppWorkspaceCronAccess,
} from '@/lib/external-apps/workspace-cron';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  const access = await requireExternalAppWorkspaceCronAccess({
    request,
    requiredScopes: [externalAppWorkspaceCronScopes.cronRead],
    wsId,
  });

  if (!access.ok) {
    return access.response;
  }

  return Response.json(await loadExternalAppWorkspaceCron(access));
}
