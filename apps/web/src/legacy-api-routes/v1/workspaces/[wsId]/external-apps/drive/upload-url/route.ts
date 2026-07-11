import {
  createExternalAppChatUpload,
  externalAppWorkspaceDriveScopes,
  handleExternalAppWorkspaceDriveRoute,
} from '@/lib/external-apps/workspace-drive';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  const { wsId } = await params;
  return handleExternalAppWorkspaceDriveRoute({
    handler: async (access) =>
      Response.json(
        await createExternalAppChatUpload(access, await request.json())
      ),
    request,
    requiredScopes: [externalAppWorkspaceDriveScopes.driveWrite],
    wsId,
  });
}
