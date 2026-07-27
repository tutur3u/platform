import { connection } from 'next/server';
import { authorizeAiStudioWorkspaceRequest } from '@/lib/session-api';
import { getAiStudioOverview } from '@/lib/studio-data';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wsId: string }> }
) {
  await connection();
  const { wsId } = await params;
  const auth = await authorizeAiStudioWorkspaceRequest(wsId, 'use_ai_studio');
  if (!auth.ok) return auth.response;

  try {
    const overview = await getAiStudioOverview({
      sbAdmin: auth.sbAdmin,
      workspaceId: auth.workspace.id,
      workspaceName: auth.workspace.name ?? auth.workspace.id,
    });
    return Response.json(overview, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch {
    return Response.json({ error: 'Overview unavailable' }, { status: 500 });
  }
}
