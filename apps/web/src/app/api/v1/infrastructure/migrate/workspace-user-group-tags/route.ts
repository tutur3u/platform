import {
  batchFetch,
  batchUpsert,
  createFetchResponse,
  createMigrationResponse,
  requireDevMode,
} from '../batch-upsert';

export async function GET(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const url = new URL(req.url);
  const wsId = url.searchParams.get('ws_id');
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);
  const limit = parseInt(url.searchParams.get('limit') || '500', 10);

  if (!wsId) {
    return Response.json({ error: 'ws_id is required' }, { status: 400 });
  }

  const result = await batchFetch({
    table: 'workspace_user_group_tags',
    wsId,
    offset,
    limit,
  });
  return createFetchResponse(result, 'workspace-user-group-tags');
}

export async function PUT(req: Request) {
  const devModeError = requireDevMode();
  if (devModeError) return devModeError;

  const json = await req.json();
  const result = await batchUpsert({
    table: 'workspace_user_group_tags',
    data: json?.data || [],
    onConflict: 'id',
  });
  return createMigrationResponse(result, 'workspace-user-group-tags');
}
