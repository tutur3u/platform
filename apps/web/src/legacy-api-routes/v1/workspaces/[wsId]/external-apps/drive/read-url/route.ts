import {
  createExternalAppChatReadUrl,
  externalAppWorkspaceDriveScopes,
  handleExternalAppWorkspaceDriveRoute,
} from '@/lib/external-apps/workspace-drive';

/** Scopes this route requires; the route-group rate limiter is tested against them. */
export const requiredScopes = [externalAppWorkspaceDriveScopes.driveRead];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  return handleExternalAppWorkspaceDriveRoute({
    handler: async (access) =>
      Response.json(
        await createExternalAppChatReadUrl(access, await request.json())
      ),
    request,
    requiredScopes,
    wsId,
  });
}
